import { commitReadme, currentReadme, replaceTopics, updateMetadata } from "../github/apply.js";
import {
  listProposals,
  readInventory,
  writeOriginalReadme,
  writeProposal,
} from "../store/index.js";
import type { Job } from "../jobs/queue.js";
import type { RepoProposal, RepoSummary } from "../../shared/types.js";

export interface ApplyRequest {
  /** When omitted, every approved proposal is applied. */
  repos?: string[];
  dryRun: boolean;
}

export interface ApplyOutcome {
  applied: string[];
  failed: { repo: string; error: string }[];
}

/**
 * The only code path that writes to GitHub. It applies exclusively to proposals
 * the user marked approved - an unapproved or skipped proposal is never touched,
 * whatever the request asks for.
 */
export async function runApply(job: Job, request: ApplyRequest): Promise<ApplyOutcome> {
  const inventory = await readInventory();
  if (!inventory) throw new Error("No scan found. Run a scan first.");

  const repoByName = new Map(inventory.repos.map((r) => [r.name, r]));
  const all = await listProposals();

  const approved = all.filter(
    (p) => p.status === "approved" && (!request.repos || request.repos.includes(p.name)),
  );

  if (approved.length === 0) {
    throw new Error("Nothing is approved yet. Approve at least one proposal before applying.");
  }

  job.setSteps(approved.map((p) => p.name));
  const outcome: ApplyOutcome = { applied: [], failed: [] };

  for (const proposal of approved) {
    job.checkCancelled();
    job.startStep(proposal.name);

    const repo = repoByName.get(proposal.name);
    if (!repo) {
      job.finishStep(proposal.name, "failed", "not in the last scan - rescan and try again");
      outcome.failed.push({ repo: proposal.name, error: "not in the last scan" });
      continue;
    }

    try {
      if (request.dryRun) {
        planCalls(job, repo, proposal);
        job.finishStep(proposal.name, "done", "dry run - nothing was sent");
        continue;
      }
      await applyOne(repo, proposal);
      outcome.applied.push(proposal.name);
      job.finishStep(proposal.name, "done", "applied");
    } catch (err) {
      const message = describeApplyError(err);
      outcome.failed.push({ repo: proposal.name, error: message });
      await writeProposal({ ...proposal, status: "failed", error: message });
      job.finishStep(proposal.name, "failed", message);
    }
  }

  return outcome;
}

function planCalls(job: Job, repo: RepoSummary, proposal: RepoProposal): void {
  job.addPlannedCall({
    repo: repo.name,
    method: "PATCH",
    path: `/repos/${repo.owner}/${repo.name}`,
    summary: `description = "${proposal.description}"`,
  });
  job.addPlannedCall({
    repo: repo.name,
    method: "PUT",
    path: `/repos/${repo.owner}/${repo.name}/topics`,
    summary: `topics = [${mergeTopics(repo.topics, proposal.topics).join(", ")}]`,
  });
  if (proposal.readme.trim()) {
    job.addPlannedCall({
      repo: repo.name,
      method: "PUT",
      path: `/repos/${repo.owner}/${repo.name}/contents/README.md`,
      summary: `${repo.files.hasReadme ? "replace" : "create"} README.md on ${repo.defaultBranch} (${proposal.readme.length} bytes)`,
    });
  }
}

/** Existing topics are kept: they may be deliberate, and the model never sees a reason to drop them. */
function mergeTopics(existing: string[], proposed: string[]): string[] {
  return [...new Set([...existing, ...proposed])].slice(0, 20);
}

async function applyOne(repo: RepoSummary, proposal: RepoProposal): Promise<void> {
  await updateMetadata(repo.owner, repo.name, { description: proposal.description });
  await replaceTopics(repo.owner, repo.name, mergeTopics(repo.topics, proposal.topics));

  let readmeSha: string | null = null;
  if (proposal.readme.trim()) {
    const existing = await currentReadme(repo.owner, repo.name);

    if (existing && !existing.updatable) {
      throw new Error(
        `This repo's README is at ${existing.path}, not README.md. Writing README.md would ` +
          "create a second one - move or rename the existing file first.",
      );
    }

    // Back up before overwriting, so the previous text is always recoverable locally.
    if (existing) await writeOriginalReadme(repo.name, existing.text);

    const result = await commitReadme(
      repo.owner,
      repo.name,
      proposal.readme,
      repo.defaultBranch,
      existing?.sha ?? null,
    );
    readmeSha = result.sha;
  }

  await writeProposal({
    ...proposal,
    status: "applied",
    applied: { at: new Date().toISOString(), readmeSha, metadataUpdated: true },
  });
}

function describeApplyError(err: unknown): string {
  const status = (err as { status?: number })?.status;
  const message = err instanceof Error ? err.message : String(err);
  if (status === 409) {
    return "The README changed on GitHub since it was read. Rescan and regenerate before applying.";
  }
  if (status === 403) {
    return "GitHub refused the write (403). The token probably lacks the `repo` scope.";
  }
  if (status === 404) {
    return "Repository not found (404). It may have been renamed or deleted since the scan.";
  }
  return message;
}
