import { buildEvidence, isTooThin } from "../analyze/fingerprint.js";
import { generateProposal } from "../ai/generate.js";
import { readInventory, readProposal, readSettings, writeEvidence, writeProposal } from "../store/index.js";
import type { Job } from "../jobs/queue.js";
import type { RepoProposal, RepoSummary } from "../../shared/types.js";

export interface GenerateRequest {
  repos: string[];
  /** Free-text correction from the owner, applied to every repo in this run. */
  hint?: string;
}

/**
 * Generates proposals one repo at a time. Sequential on purpose: it keeps the
 * cost meter truthful, keeps GitHub rate limits comfortable, and means cancelling
 * stops at a clean boundary with everything generated so far already on disk.
 */
export async function runGenerate(job: Job, request: GenerateRequest): Promise<void> {
  const settings = await readSettings();
  const inventory = await readInventory();
  if (!inventory) throw new Error("No scan found. Run a scan first.");

  const byName = new Map(inventory.repos.map((r) => [r.name, r]));
  const targets = request.repos
    .map((name) => byName.get(name))
    .filter((r): r is RepoSummary => r !== undefined);

  if (targets.length === 0) throw new Error("None of the selected repositories are in the last scan.");

  job.setSteps(targets.map((r) => r.name));

  for (const repo of targets) {
    job.checkCancelled();
    job.startStep(repo.name);

    try {
      // Re-approving an applied repo is a deliberate act; skip it otherwise so a
      // second run over the whole account does not churn what is already live.
      const existing = await readProposal(repo.name);
      if (existing?.status === "applied") {
        job.finishStep(repo.name, "skipped", "already applied - delete the proposal to regenerate");
        continue;
      }

      if (repo.files.hasReadme && !settings.overwriteExistingReadme && !request.hint) {
        job.finishStep(
          repo.name,
          "skipped",
          "already has a README - enable overwrite in Settings to regenerate",
        );
        continue;
      }

      const evidence = await buildEvidence(repo);
      await writeEvidence(repo.name, evidence);

      if (isTooThin(evidence)) {
        job.finishStep(
          repo.name,
          "skipped",
          "not enough code to describe honestly - consider archiving or deleting this repo",
        );
        continue;
      }

      const result = await generateProposal(evidence, {
        model: settings.model,
        effort: settings.effort,
        mock: settings.mockAi,
        ...(request.hint ? { hint: request.hint } : {}),
      });

      job.recordUsage(result.usage);

      const proposal: RepoProposal = {
        name: repo.name,
        status: "pending",
        description: result.proposal.description,
        topics: result.proposal.topics,
        readme: result.proposal.readme,
        confidence: result.proposal.confidence,
        reasoning: result.proposal.reasoning,
        unknowns: [...result.proposal.unknowns, ...result.notes],
        generatedAt: new Date().toISOString(),
        model: settings.mockAi ? "mock" : settings.model,
      };

      await writeProposal(proposal);
      job.finishStep(repo.name, "done", `confidence: ${proposal.confidence}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // One bad repo must not end the run - record it and keep going.
      job.finishStep(repo.name, "failed", message);
    }
  }
}
