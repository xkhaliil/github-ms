import type { Plugin, ViteDevServer } from "vite";
import {
  bridgeStatus,
  json,
  pingClaude,
  readBody,
  runClaude,
  type BridgeRequest,
} from "../core/ai/claude-cli.js";

/**
 * Serves `/api/claude/*` from the Vite dev server, so `npm run dev` behaves the
 * same as the deployed Vercel functions of the same name (see `api/claude/`).
 * The actual CLI-spawning logic lives in `core/ai/claude-cli.ts` and is shared
 * between both; this file only wires it into Vite's middleware.
 */

export const BRIDGE_PREFIX = "/api/claude";

export function claudeBridge(): Plugin {
  return {
    name: "gitms-claude-bridge",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(BRIDGE_PREFIX, (req, res, next) => {
        const path = (req.url ?? "/").split("?")[0];

        if (req.method === "GET" && path === "/status") {
          json(res, 200, bridgeStatus());
          return;
        }

        if (req.method === "POST" && path === "/generate") {
          void (async () => {
            try {
              const body = JSON.parse(await readBody(req)) as BridgeRequest & {
                token?: string;
                test?: boolean;
              };
              if (body.test) {
                await pingClaude(body.token ?? "");
                json(res, 200, { ok: true });
                return;
              }
              json(res, 200, await runClaude(body, body.token));
            } catch (err) {
              json(res, 502, {
                error: err instanceof Error ? err.message : String(err),
              });
            }
          })();
          return;
        }

        next();
      });
    },
  };
}
