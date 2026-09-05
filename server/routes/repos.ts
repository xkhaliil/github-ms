import type { FastifyInstance } from "fastify";
import { auditRepo, prioritise } from "../analyze/hygiene.js";
import { readAudit, readEvidence, readInventory, readProposal } from "../store/index.js";
import type { Evidence } from "../analyze/fingerprint.js";

export async function repoRoutes(app: FastifyInstance): Promise<void> {
  /** The dashboard's whole payload: repos, audit and the priority list in one call. */
  app.get("/api/repos", async () => {
    const inventory = await readInventory();
    if (!inventory) {
      return { scanned: false, repos: [], audit: null, priority: [] };
    }
    const audit = (await readAudit()) ?? null;
    return {
      scanned: true,
      scannedAt: inventory.scannedAt,
      owner: inventory.owner,
      repos: inventory.repos,
      audit,
      priority: audit ? prioritise(audit, inventory.repos) : [],
    };
  });

  app.get<{ Params: { name: string } }>("/api/repos/:name", async (req, reply) => {
    const inventory = await readInventory();
    const repo = inventory?.repos.find((r) => r.name === req.params.name);
    if (!repo) {
      reply.code(404);
      return { error: `No scanned repository named ${req.params.name}.` };
    }

    // Evidence is only present once generation has run for this repo.
    const evidence = await readEvidence<Evidence>(repo.name).catch(() => null);
    const proposal = await readProposal(repo.name).catch(() => null);

    return { repo, audit: auditRepo(repo), evidence, proposal };
  });
}
