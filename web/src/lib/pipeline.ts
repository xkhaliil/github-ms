import { auditAccount } from "@core/analyze/hygiene.js";
import { buildEvidence, isTooThin } from "@core/analyze/fingerprint.js";
import { generateProposal } from "@core/ai/generate.js";
import { github } from "@core/github/client.js";
import {
  applyScanFilters,
  deriveFileFacts,
  getTree,
  listOwnedRepos,
  scanOptionsFrom,
} from "@core/github/repos.js";
import {
  commitReadme,
  currentReadme,
  replaceTopics,
  updateMetadata,
} from "@core/github/apply.js";
import {
  getGithubIdentity,
  requireAnthropicKey,
  requireGithubToken,
} from "./credentials.js";
import {
  listProposals,
  readInventory,
  readProposal,
  readSettings,
  writeAudit,
  writeEvidence,
  writeInventory,
  writeOriginalReadme,
  writeProposal,
  type Inventory,
} from "./store.js";
import { bridgeStatus, generateViaBridge } from "./bridge.js";
import type { Job } from "./jobs.js";
import type { RepoProposal, RepoSummary } from "@shared/types.js";

/** One authenticated client per run, so the throttle plugin sees the whole run. */
const gh = () => github(requireGithubToken());

/* ------------------------------------------------------------------ scan --- */

export async function runScan(job: Job): Promise<void> {
  const client = gh();
  const settings = await readSettings();
  const all = await listOwnedRepos(client);
  const repos = applyScanFilters(all, scanOptionsFrom(settings));

  job.setSteps(repos.map((r) => r.name));

  for (const repo of repos) {
    job.checkCancelled();
    job.startStep(repo.name);
    if (repo.isEmpty) {
      repo.files = {
        hasReadme: false,
        hasLicenseFile: false,
        hasGitignore: false,
        hasCi: false,
        deployHints: [],
        incomplete: true,
      };
      job.finishStep(repo.name, "done", "empty repository");
      continue;
    }
    const tree = await getTree(
      client,
      repo.owner,
      repo.name,
      repo.defaultBranch,
    );
    repo.files = deriveFileFacts(tree);
    job.finishStep(
      repo.name,
      "done",
      tree.ok ? `${tree.paths.length} files` : "could not read file tree",
    );
  }

  const scannedAt = new Date().toISOString();
  const owner = getGithubIdentity()?.login ?? repos[0]?.owner ?? "unknown";

  const inventory: Inventory = { scannedAt, owner, repos };
  await writeInventory(inventory);
  await writeAudit(auditAccount(owner, repos, scannedAt));
}

/* -------------------------------------------------------------- generate --- */

export interface GenerateRequest {
  repos: string[];
  hint?: string;
}

/**
 * The bridge only exists in the dev server, so the two ways this fails are worth
 * telling apart: a deployed build has no endpoint at all, and a local one can
 * still be missing the CLI it shells out to.
 */
async function requireBridge(): Promise<void> {
  const status = await bridgeStatus();
  if (status.available) return;

  throw new Error(
    status.binary === null
      ? "Claude Code generation needs the local dev server (`npm run dev`) and the Claude Code CLI on this machine. " +
        "Install the CLI, or switch Settings back to the Anthropic API key."
      : "The Claude Code bridge is unavailable.",
  );
}

export async function runGenerate(
  job: Job,
  request: GenerateRequest,
): Promise<void> {
  const client = gh();
  const settings = await readSettings();
  const viaClaudeCode = !settings.mockAi && settings.provider === "claude-code";

  // Fail before the loop rather than on the first repo, so nothing is half-run.
  // Each provider has its own precondition, and neither is worth discovering ten
  // repos in: the API path needs a key, the CLI path needs the local bridge.
  const apiKey = settings.mockAi || viaClaudeCode ? "" : requireAnthropicKey();
  if (viaClaudeCode) await requireBridge();

  const inventory = await readInventory();
  if (!inventory) throw new Error("No scan found. Run a scan first.");

  const byName = new Map(inventory.repos.map((r) => [r.name, r]));
  const targets = request.repos
    .map((name) => byName.get(name))
    .filter((r): r is RepoSummary => r !== undefined);

  if (targets.length === 0)
    throw new Error("None of the selected repositories are in the last scan.");

  job.setSteps(targets.map((r) => r.name));

  for (const repo of targets) {
    job.checkCancelled();
    job.startStep(repo.name);

    try {
      const existing = await readProposal(repo.name);
      if (existing?.status === "applied") {
        job.finishStep(
          repo.name,
          "skipped",
          "already applied - delete the proposal to regenerate",
        );
        continue;
      }

      if (
        repo.files.hasReadme &&
        !settings.overwriteExistingReadme &&
        !request.hint
      ) {
        job.finishStep(
          repo.name,
          "skipped",
          "already has a README - enable overwrite in Settings to regenerate",
        );
        continue;
      }

      const evidence = await buildEvidence(client, repo);
      await writeEvidence(repo.name, evidence);

      if (isTooThin(evidence)) {
        job.finishStep(
          repo.name,
          "skipped",
          "not enough code to describe honestly - consider archiving or deleting this repo",
        );
        continue;
      }

      const result = viaClaudeCode
        ? await generateViaBridge(evidence, {
            model: settings.model,
            effort: settings.effort,
            ...(request.hint ? { hint: request.hint } : {}),
          })
        : await generateProposal(evidence, {
            apiKey,
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
      job.finishStep(repo.name, "failed", message);
    }
  }
}

/* ----------------------------------------------------------------- apply --- */

export interface ApplyRequest {
  repos?: string[];
  dryRun: boolean;
}

export async function runApply(job: Job, request: ApplyRequest): Promise<void> {
  const client = gh();
  const inventory = await readInventory();
  if (!inventory) throw new Error("No scan found. Run a scan first.");

  const repoByName = new Map(inventory.repos.map((r) => [r.name, r]));
  const all = await listProposals();

  const approved = all.filter(
    (p) =>
      p.status === "approved" &&
      (!request.repos || request.repos.includes(p.name)),
  );

  if (approved.length === 0) {
    throw new Error(
      "Nothing is approved yet. Approve at least one proposal before applying.",
    );
  }

  job.setSteps(approved.map((p) => p.name));

  for (const proposal of approved) {
    job.checkCancelled();
    job.startStep(proposal.name);

    const repo = repoByName.get(proposal.name);
    if (!repo) {
      job.finishStep(
        proposal.name,
        "failed",
        "not in the last scan - rescan and try again",
      );
      continue;
    }

    try {
      if (request.dryRun) {
        planCalls(job, repo, proposal);
        job.finishStep(proposal.name, "done", "dry run - nothing was sent");
        continue;
      }
      await applyOne(repo, proposal);
      job.finishStep(proposal.name, "done", "applied");
    } catch (err) {
      const message = describeApplyError(err);
      await writeProposal({ ...proposal, status: "failed", error: message });
      job.finishStep(proposal.name, "failed", message);
    }
  }

  async function applyOne(
    repo: RepoSummary,
    proposal: RepoProposal,
  ): Promise<void> {
    await updateMetadata(client, repo.owner, repo.name, {
      description: proposal.description,
    });
    await replaceTopics(
      client,
      repo.owner,
      repo.name,
      mergeTopics(repo.topics, proposal.topics),
    );

    let readmeSha: string | null = null;
    if (proposal.readme.trim()) {
      const existing = await currentReadme(client, repo.owner, repo.name);

      if (existing && !existing.updatable) {
        throw new Error(
          `This repo's README is at ${existing.path}, not README.md. Writing README.md would ` +
            "create a second one - move or rename the existing file first.",
        );
      }

      if (existing) await writeOriginalReadme(repo.name, existing.text);

      const result = await commitReadme(
        client,
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
      applied: {
        at: new Date().toISOString(),
        readmeSha,
        metadataUpdated: true,
      },
    });
  }
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

function mergeTopics(existing: string[], proposed: string[]): string[] {
  return [...new Set([...existing, ...proposed])].slice(0, 20);
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
