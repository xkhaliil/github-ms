import type { IncomingMessage, ServerResponse } from "node:http";
import { bridgeStatus, json } from "../../core/ai/claude-cli.js";

/**
 * Reports whether the Claude Code CLI is packaged in this deployment, not
 * whether any particular visitor is authenticated - that depends on a token
 * they hold, not on anything this endpoint can see. See `requiresToken` on the
 * response: true means no ambient login exists here and a visitor must paste
 * their own `claude setup-token` token before generating.
 */
export default function handler(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== "GET") {
    json(res, 405, { error: "GET only." });
    return;
  }
  json(res, 200, bridgeStatus());
}
