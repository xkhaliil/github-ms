import type { FastifyInstance } from "fastify";
import { readSettings, writeSettings } from "../store/index.js";
import { estimateRun } from "../jobs/pricing.js";
import { EFFORTS, MODELS, type Settings } from "../../shared/types.js";

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/settings", async () => readSettings());

  app.put<{ Body: Partial<Settings> }>("/api/settings", async (req, reply) => {
    const body = req.body ?? {};
    const patch: Partial<Settings> = {};

    if (body.model !== undefined) {
      if (!MODELS.includes(body.model)) {
        reply.code(400);
        return { error: `Unknown model: ${String(body.model)}` };
      }
      patch.model = body.model;
    }
    if (body.effort !== undefined) {
      if (!EFFORTS.includes(body.effort)) {
        reply.code(400);
        return { error: `Unknown effort: ${String(body.effort)}` };
      }
      patch.effort = body.effort;
    }
    for (const key of [
      "batchMode",
      "mockAi",
      "includeForks",
      "includeArchived",
      "includePrivate",
      "overwriteExistingReadme",
    ] as const) {
      if (typeof body[key] === "boolean") patch[key] = body[key];
    }

    return writeSettings(patch);
  });

  /** Pre-run cost estimate, so the number is on screen before any money is spent. */
  app.get<{ Querystring: { repos?: string } }>("/api/settings/estimate", async (req) => {
    const settings = await readSettings();
    const count = Number.parseInt(req.query.repos ?? "0", 10) || 0;
    return {
      repos: count,
      model: settings.model,
      batchMode: settings.batchMode,
      mockAi: settings.mockAi,
      estimatedCostUsd: settings.mockAi ? 0 : estimateRun(count, settings.model, settings.batchMode),
    };
  });
}
