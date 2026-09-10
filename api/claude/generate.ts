import type { IncomingMessage, ServerResponse } from "node:http";
import {
  json,
  pingClaude,
  readBody,
  runClaude,
  type BridgeRequest,
} from "../../core/ai/claude-cli.js";

/**
 * Relays one generation call to a locally-spawned `claude` process. A visitor's
 * own `claude setup-token` token, when present, travels in the request body and
 * lives only for the duration of this one call - it is never logged and never
 * written anywhere. `test: true` skips real generation and just confirms the
 * token authenticates, for the Setup page's "Test connection" button.
 */
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== "POST") {
    json(res, 405, { error: "POST only." });
    return;
  }

  try {
    const body = JSON.parse(await readBody(req)) as BridgeRequest & {
      token?: string;
      test?: boolean;
    };

    if (body.test) {
      await pingClaude(body.token);
      json(res, 200, { ok: true });
      return;
    }

    json(res, 200, await runClaude(body, body.token));
  } catch (err) {
    json(res, 502, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
