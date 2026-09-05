import type { FastifyInstance } from "fastify";
import { currentJob, getJob, recentJobs, startJob } from "../jobs/queue.js";
import { runScan } from "../pipeline/scan.js";
import { runGenerate } from "../pipeline/generate.js";
import { runApply } from "../pipeline/apply.js";
import { readSettings } from "../store/index.js";

interface GenerateBody {
  repos?: string[];
  hint?: string;
}

interface ApplyBody {
  repos?: string[];
  dryRun?: boolean;
}

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/jobs", async () => ({
    current: currentJob()?.get() ?? null,
    recent: recentJobs(),
  }));

  app.get<{ Params: { id: string } }>("/api/jobs/:id", async (req, reply) => {
    const job = getJob(req.params.id);
    if (!job) {
      reply.code(404);
      return { error: "No such job." };
    }
    return job.get();
  });

  /**
   * Server-sent events: the UI opens this once per job and receives every state
   * change until the job reaches a terminal state.
   */
  app.get<{ Params: { id: string } }>("/api/jobs/:id/stream", async (req, reply) => {
    const job = getJob(req.params.id);
    if (!job) {
      reply.code(404);
      return { error: "No such job." };
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // Without this, a proxy in front of the dev server may buffer the stream.
      "X-Accel-Buffering": "no",
    });

    const unsubscribe = job.subscribe((snapshot) => {
      reply.raw.write(`data: ${JSON.stringify(snapshot)}\n\n`);
      if (["done", "failed", "cancelled"].includes(snapshot.state)) {
        reply.raw.end();
      }
    });

    // A closed tab must not leak a listener into the job for the rest of the run.
    req.raw.on("close", unsubscribe);
    return reply;
  });

  app.post<{ Params: { id: string } }>("/api/jobs/:id/cancel", async (req, reply) => {
    const job = getJob(req.params.id);
    if (!job) {
      reply.code(404);
      return { error: "No such job." };
    }
    job.cancel();
    return job.get();
  });

  app.post("/api/scan", async (_req, reply) => {
    const settings = await readSettings();
    try {
      const job = startJob("scan", settings.model, settings.batchMode, async (j) => {
        await runScan(j);
      });
      return { jobId: job.id };
    } catch (err) {
      reply.code(409);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post<{ Body: GenerateBody }>("/api/generate", async (req, reply) => {
    const settings = await readSettings();
    const repos = req.body?.repos ?? [];
    if (repos.length === 0) {
      reply.code(400);
      return { error: "Select at least one repository." };
    }

    try {
      const hint = req.body?.hint;
      const job = startJob("generate", settings.model, settings.batchMode, async (j) => {
        await runGenerate(j, hint ? { repos, hint } : { repos });
      });
      return { jobId: job.id };
    } catch (err) {
      reply.code(409);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post<{ Body: ApplyBody }>("/api/apply", async (req, reply) => {
    const settings = await readSettings();
    // Dry run is the default: applying for real requires saying so explicitly.
    const dryRun = req.body?.dryRun !== false;
    const repos = req.body?.repos;

    try {
      const job = startJob("apply", settings.model, settings.batchMode, async (j) => {
        await runApply(j, repos ? { repos, dryRun } : { dryRun });
      });
      return { jobId: job.id, dryRun };
    } catch (err) {
      reply.code(409);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}
