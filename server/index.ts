import { APP_URL, API_PORT, HOST, WEB_PORT } from "../shared/constants.js";
import open from "open";
import { buildServer } from "./app.js";
import { loadPersistedCredentials } from "./session.js";
import { ensureDataDir } from "./store/index.js";
import type { FastifyInstance } from "fastify";

const isProd = process.env["NODE_ENV"] === "production";

/**
 * `node --watch` starts the replacement process before the outgoing one has
 * released its socket, so the first listen attempt after a file save routinely
 * loses the race. Retrying briefly turns a crash-and-wait into a pause nobody
 * notices; a port genuinely held by something else still fails, with a message
 * that says what to do about it.
 */
async function listenWithRetry(app: FastifyInstance, port: number): Promise<void> {
  const attempts = 20;
  for (let i = 0; i < attempts; i++) {
    try {
      await app.listen({ host: HOST, port });
      return;
    } catch (err) {
      const inUse = (err as NodeJS.ErrnoException).code === "EADDRINUSE";
      if (!inUse) throw err;
      if (i === attempts - 1) {
        // A stack trace adds nothing here - the cause is known and the fix is a
        // command, so print that and stop rather than dumping Node internals.
        console.error(
          `\n  Port ${port} is already in use, and did not free up.\n\n` +
            "  Another gitms server is still running - most often one left behind\n" +
            "  when a previous terminal was closed. Find and stop it:\n\n" +
            `    netstat -ano | findstr :${port}\n` +
            "    taskkill /PID <the id from that line> /F\n\n" +
            "  Then start gitms again.\n",
        );
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

/**
 * Close Fastify on the way out so the port is released promptly.
 *
 * The hard deadline is not optional. Registering a signal handler replaces the
 * default "terminate immediately" behaviour, and `app.close()` waits for open
 * connections - including a job's SSE stream, which stays open by design. Without
 * the timeout, a watch restart during a run leaves the old process alive holding
 * the port, which is worse than having no handler at all.
 */
const SHUTDOWN_DEADLINE_MS = 750;

function shutdownOn(app: FastifyInstance): void {
  let closing = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (closing) return;
      closing = true;
      const force = setTimeout(() => process.exit(0), SHUTDOWN_DEADLINE_MS);
      void app.close().then(
        () => {
          clearTimeout(force);
          process.exit(0);
        },
        () => {
          clearTimeout(force);
          process.exit(1);
        },
      );
    });
  }
}

async function main(): Promise<void> {
  await ensureDataDir();
  const loaded = await loadPersistedCredentials();

  const app = await buildServer();
  shutdownOn(app);

  const port = isProd ? WEB_PORT : API_PORT;
  await listenWithRetry(app, port);

  const url = isProd ? `http://${HOST}:${port}` : APP_URL;
  console.log(`\n  gitms  ->  ${url}`);
  console.log(loaded ? "  credentials: loaded from disk" : "  credentials: none stored (enter them in Setup)");
  console.log(isProd ? "" : `  api: http://${HOST}:${API_PORT}\n`);

  if (!process.env["GITMS_NO_OPEN"]) {
    // In dev, give Vite a moment to bind before pointing a browser at it.
    setTimeout(() => void open(url).catch(() => {}), isProd ? 0 : 2000);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
