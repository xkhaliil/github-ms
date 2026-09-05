import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { API_PORT, APP_URL, HOST, SESSION_HEADER, WEB_PORT } from "../shared/constants.js";
import { WEB_DIST } from "./paths.js";
import { isValidSession, sessionToken } from "./session.js";
import { authRoutes } from "./routes/auth.js";
import { repoRoutes } from "./routes/repos.js";
import { jobRoutes } from "./routes/jobs.js";
import { proposalRoutes } from "./routes/proposals.js";
import { settingsRoutes } from "./routes/settings.js";

const isProd = process.env["NODE_ENV"] === "production";

/**
 * Only pages served from this app may drive the API. A browser always sends
 * Origin on cross-origin requests, so this is what actually stops a random
 * website from reaching the loopback API and spending your API credit.
 */
const ALLOWED_ORIGINS = new Set([
  APP_URL,
  `http://localhost:${WEB_PORT}`,
  `http://${HOST}:${API_PORT}`,
  `http://localhost:${API_PORT}`,
]);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env["LOG_LEVEL"] ?? "warn",
      // Credentials never reach the logger, but redact defensively anyway.
      redact: ["req.headers.authorization", `req.headers["${SESSION_HEADER}"]`],
    },
  });

  app.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      reply.code(403);
      throw new Error("Cross-origin requests are not allowed.");
    }
    if (!req.url.startsWith("/api/")) return;
    if (SAFE_METHODS.has(req.method)) return;
    if (!isValidSession(req.headers[SESSION_HEADER] as string | undefined)) {
      reply.code(401);
      throw new Error("Missing or invalid session token. Reload the page.");
    }
  });

  // Handed to the page so it can sign mutating requests. Guarded by the Origin
  // check above; the loopback bind keeps it off the network entirely.
  app.get("/api/session", async () => ({ token: sessionToken() }));

  app.get("/api/health", async () => ({ ok: true, version: "0.1.0" }));

  await app.register(authRoutes);
  await app.register(settingsRoutes);
  await app.register(repoRoutes);
  await app.register(jobRoutes);
  await app.register(proposalRoutes);

  // In production Fastify serves the built UI too, so there is only one port.
  if (isProd && existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, { root: WEB_DIST });
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith("/api/")) {
        reply.code(404);
        return { error: "Not found" };
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
