import type { FastifyInstance } from "fastify";
import {
  deleteProposal,
  listProposals,
  readProposal,
  rebuildManifest,
  writeProposal,
} from "../store/index.js";
import { GITHUB_DESCRIPTION_MAX, TOPIC_PATTERN, MAX_TOPICS } from "../ai/schemas.js";
import type { ProposalStatus } from "../../shared/types.js";

interface UpdateBody {
  description?: string;
  topics?: string[];
  readme?: string;
  status?: ProposalStatus;
}

interface BulkBody {
  repos?: string[];
  status?: ProposalStatus;
  /** Approve everything at or above this confidence instead of naming repos. */
  minConfidence?: "high" | "medium" | "low";
}

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const;
const VALID_STATUSES: ProposalStatus[] = ["pending", "approved", "skipped", "applied", "failed"];

export async function proposalRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/proposals", async () => ({
    proposals: await listProposals(),
    manifest: await rebuildManifest(),
  }));

  app.get<{ Params: { name: string } }>("/api/proposals/:name", async (req, reply) => {
    const proposal = await readProposal(req.params.name);
    if (!proposal) {
      reply.code(404);
      return { error: "No proposal for that repository yet." };
    }
    return proposal;
  });

  /** The review gate: the user's edits win over whatever the model produced. */
  app.put<{ Params: { name: string }; Body: UpdateBody }>(
    "/api/proposals/:name",
    async (req, reply) => {
      const existing = await readProposal(req.params.name);
      if (!existing) {
        reply.code(404);
        return { error: "No proposal for that repository yet." };
      }

      const body = req.body ?? {};
      const next = { ...existing };

      if (typeof body.description === "string") {
        const description = body.description.trim();
        if (description.length > GITHUB_DESCRIPTION_MAX) {
          reply.code(400);
          return { error: `Description must be ${GITHUB_DESCRIPTION_MAX} characters or fewer.` };
        }
        next.description = description;
      }

      if (Array.isArray(body.topics)) {
        const topics = body.topics.map((t) => t.trim().toLowerCase()).filter(Boolean);
        const invalid = topics.filter((t) => !TOPIC_PATTERN.test(t));
        if (invalid.length) {
          reply.code(400);
          return {
            error: `Invalid topics: ${invalid.join(", ")}. Use lowercase letters, digits and hyphens.`,
          };
        }
        if (topics.length > MAX_TOPICS) {
          reply.code(400);
          return { error: `GitHub topics are capped at ${MAX_TOPICS} here.` };
        }
        next.topics = [...new Set(topics)];
      }

      if (typeof body.readme === "string") next.readme = body.readme;

      if (body.status) {
        if (!VALID_STATUSES.includes(body.status)) {
          reply.code(400);
          return { error: `Unknown status: ${body.status}` };
        }
        // "applied" is set by the apply pipeline, never by a client edit.
        if (body.status === "applied") {
          reply.code(400);
          return { error: "A proposal becomes applied by running Apply, not by editing it." };
        }
        next.status = body.status;
      }

      await writeProposal(next);
      await rebuildManifest();
      return next;
    },
  );

  /** Bulk approve/skip - either an explicit list, or everything above a confidence bar. */
  app.post<{ Body: BulkBody }>("/api/proposals/bulk", async (req, reply) => {
    const body = req.body ?? {};
    const status = body.status ?? "approved";
    if (!VALID_STATUSES.includes(status) || status === "applied") {
      reply.code(400);
      return { error: `Cannot bulk-set status to ${status}.` };
    }

    const all = await listProposals();
    const targets = all.filter((p) => {
      if (p.status === "applied") return false; // never re-flag work already live
      if (body.repos) return body.repos.includes(p.name);
      if (body.minConfidence) {
        return CONFIDENCE_RANK[p.confidence] >= CONFIDENCE_RANK[body.minConfidence];
      }
      return false;
    });

    for (const proposal of targets) {
      await writeProposal({ ...proposal, status });
    }

    return { updated: targets.map((p) => p.name), manifest: await rebuildManifest() };
  });

  app.delete<{ Params: { name: string } }>("/api/proposals/:name", async (req) => {
    await deleteProposal(req.params.name);
    return { deleted: req.params.name, manifest: await rebuildManifest() };
  });
}
