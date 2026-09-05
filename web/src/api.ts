import { auditRepo, prioritise } from "@core/analyze/hygiene.js";
import { describeAnthropicError, resetAnthropicCache, testAnthropicKey } from "@core/ai/client.js";
import { describeGithubError, resetClientCache, testGithubToken } from "@core/github/client.js";
import { GITHUB_DESCRIPTION_MAX, MAX_TOPICS, TOPIC_PATTERN } from "@core/ai/schemas.js";
import { estimateRun } from "@core/pricing.js";
import * as creds from "./lib/credentials.js";
import * as store from "./lib/store.js";
import { currentJob, getJob, recentJobs, startJob, type Job } from "./lib/jobs.js";
import { runApply, runGenerate, runScan } from "./lib/pipeline.js";
import type {
  AccountAudit,
  AuthStatus,
  ConnectionTest,
  JobSnapshot,
  ManifestEntry,
  ProposalStatus,
  RepoAudit,
  RepoProposal,
  RepoSummary,
  Settings,
} from "@shared/types.js";

/**
 * The boundary the pages call. gitms runs entirely in this tab: each function
 * executes against the user's own credentials, talking only to api.github.com
 * and api.anthropic.com. Keeping it shaped like a client means the pages stay
 * unaware of where the work happens.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Loads credentials from browser storage. Async so App.tsx is unchanged. */
export async function initSession(): Promise<void> {
  creds.loadCredentials();
}

/* ---------------------------------------------------------------- auth --- */

export const getAuthStatus = async (): Promise<AuthStatus> => creds.authStatus();

export async function testCredential(
  kind: "anthropic" | "github",
  value?: string,
): Promise<ConnectionTest> {
  const held = creds.getCredentials();
  const candidate =
    value?.trim() || (kind === "anthropic" ? held.anthropicKey : held.githubToken) || "";

  if (!candidate) {
    return {
      ok: false,
      kind,
      error: kind === "anthropic" ? "Enter an Anthropic API key." : "Enter a GitHub token.",
    };
  }

  try {
    if (kind === "anthropic") {
      const settings = await store.readSettings();
      const { identity, warning } = await testAnthropicKey(candidate, settings.model);
      return warning === undefined
        ? { ok: true, kind, identity }
        : { ok: true, kind, identity, warning };
    }
    const { identity, warning } = await testGithubToken(candidate);
    if (candidate === held.githubToken) creds.setGithubIdentity(identity);
    return warning === undefined
      ? { ok: true, kind, identity }
      : { ok: true, kind, identity, warning };
  } catch (err) {
    const described = kind === "anthropic" ? describeAnthropicError(err) : describeGithubError(err);
    return { ok: false, kind, ...described };
  }
}

export async function saveCredentials(payload: {
  anthropicKey?: string;
  githubToken?: string;
  remember?: boolean;
}): Promise<{ status: AuthStatus; permissionsRestricted: boolean }> {
  if (payload.remember !== undefined) creds.setRemember(payload.remember);

  if (typeof payload.anthropicKey === "string") {
    creds.setAnthropicKey(payload.anthropicKey);
    resetAnthropicCache();
  }
  if (typeof payload.githubToken === "string") {
    creds.setGithubToken(payload.githubToken);
    resetClientCache();
    creds.setGithubIdentity(null);
    if (payload.githubToken.trim()) {
      try {
        const { identity } = await testGithubToken(payload.githubToken.trim());
        creds.setGithubIdentity(identity);
      } catch {
        // A save with a bad token is still a save; the test path reports why.
      }
    }
  }

  // Browser storage has no file permissions to restrict; the Setup page carries a
  // storage-specific warning instead, so this stays true rather than alarming.
  return { status: creds.authStatus(), permissionsRestricted: true };
}

export async function clearCredentials(): Promise<AuthStatus> {
  creds.clearCredentials();
  resetClientCache();
  resetAnthropicCache();
  return creds.authStatus();
}

/** Wipes scans, proposals and evidence from this device. */
export const clearLocalData = () => store.clearAllData();

/* --------------------------------------------------------------- repos --- */

export interface ReposResponse {
  scanned: boolean;
  scannedAt?: string;
  owner?: string;
  repos: RepoSummary[];
  audit: AccountAudit | null;
  priority: string[];
}

export async function getRepos(): Promise<ReposResponse> {
  const inventory = await store.readInventory();
  if (!inventory) return { scanned: false, repos: [], audit: null, priority: [] };

  const audit = await store.readAudit();
  return {
    scanned: true,
    scannedAt: inventory.scannedAt,
    owner: inventory.owner,
    repos: inventory.repos,
    audit,
    priority: audit ? prioritise(audit, inventory.repos) : [],
  };
}

export interface RepoDetail {
  repo: RepoSummary;
  audit: RepoAudit;
  evidence: unknown | null;
  proposal: RepoProposal | null;
}

export async function getRepo(name: string): Promise<RepoDetail> {
  const inventory = await store.readInventory();
  const repo = inventory?.repos.find((r) => r.name === name);
  if (!repo) throw new ApiError(`No scanned repository named ${name}.`, 404);

  return {
    repo,
    audit: auditRepo(repo),
    evidence: await store.readEvidence(name),
    proposal: await store.readProposal(name),
  };
}

/* ----------------------------------------------------------- proposals --- */

export async function getProposals(): Promise<{
  proposals: RepoProposal[];
  manifest: ManifestEntry[];
}> {
  return { proposals: await store.listProposals(), manifest: await store.rebuildManifest() };
}

const VALID_STATUSES: ProposalStatus[] = ["pending", "approved", "skipped", "applied", "failed"];
const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const;

export async function updateProposal(
  name: string,
  patch: { description?: string; topics?: string[]; readme?: string; status?: ProposalStatus },
): Promise<RepoProposal> {
  const existing = await store.readProposal(name);
  if (!existing) throw new ApiError("No proposal for that repository yet.", 404);

  const next = { ...existing };

  if (typeof patch.description === "string") {
    const description = patch.description.trim();
    if (description.length > GITHUB_DESCRIPTION_MAX) {
      throw new ApiError(`Description must be ${GITHUB_DESCRIPTION_MAX} characters or fewer.`, 400);
    }
    next.description = description;
  }

  if (Array.isArray(patch.topics)) {
    const topics = patch.topics.map((t) => t.trim().toLowerCase()).filter(Boolean);
    const invalid = topics.filter((t) => !TOPIC_PATTERN.test(t));
    if (invalid.length) {
      throw new ApiError(
        `Invalid topics: ${invalid.join(", ")}. Use lowercase letters, digits and hyphens.`,
        400,
      );
    }
    if (topics.length > MAX_TOPICS) {
      throw new ApiError(`GitHub topics are capped at ${MAX_TOPICS} here.`, 400);
    }
    next.topics = [...new Set(topics)];
  }

  if (typeof patch.readme === "string") next.readme = patch.readme;

  if (patch.status) {
    if (!VALID_STATUSES.includes(patch.status)) {
      throw new ApiError(`Unknown status: ${patch.status}`, 400);
    }
    // "applied" is set by the apply pipeline, never by a client edit.
    if (patch.status === "applied") {
      throw new ApiError("A proposal becomes applied by running Apply, not by editing it.", 400);
    }
    next.status = patch.status;
  }

  await store.writeProposal(next);
  return next;
}

export async function bulkUpdateProposals(payload: {
  repos?: string[];
  status?: ProposalStatus;
  minConfidence?: "high" | "medium" | "low";
}): Promise<{ updated: string[]; manifest: ManifestEntry[] }> {
  const status = payload.status ?? "approved";
  if (!VALID_STATUSES.includes(status) || status === "applied") {
    throw new ApiError(`Cannot bulk-set status to ${status}.`, 400);
  }

  const all = await store.listProposals();
  const targets = all.filter((p) => {
    if (p.status === "applied") return false; // never re-flag work already live
    if (payload.repos) return payload.repos.includes(p.name);
    if (payload.minConfidence) {
      return CONFIDENCE_RANK[p.confidence] >= CONFIDENCE_RANK[payload.minConfidence];
    }
    return false;
  });

  for (const proposal of targets) {
    await store.writeProposal({ ...proposal, status });
  }

  return { updated: targets.map((p) => p.name), manifest: await store.rebuildManifest() };
}

export async function deleteProposal(name: string): Promise<{ deleted: string }> {
  await store.deleteProposal(name);
  return { deleted: name };
}

/* ------------------------------------------------------------ settings --- */

export const getSettings = () => store.readSettings();
export const updateSettings = (patch: Partial<Settings>) => store.writeSettings(patch);

export async function getEstimate(repos: number): Promise<{
  repos: number;
  model: string;
  batchMode: boolean;
  mockAi: boolean;
  estimatedCostUsd: number;
}> {
  const settings = await store.readSettings();
  return {
    repos,
    model: settings.model,
    batchMode: settings.batchMode,
    mockAi: settings.mockAi,
    estimatedCostUsd: settings.mockAi ? 0 : estimateRun(repos, settings.model, settings.batchMode),
  };
}

/* ---------------------------------------------------------------- jobs --- */

async function begin(
  kind: "scan" | "generate" | "apply",
  run: (job: Job) => Promise<void>,
): Promise<string> {
  const settings = await store.readSettings();
  try {
    return startJob(kind, settings.model, settings.batchMode, run).id;
  } catch (err) {
    throw new ApiError(err instanceof Error ? err.message : String(err), 409);
  }
}

export const startScan = async () => ({ jobId: await begin("scan", runScan) });

export const startGenerate = async (repos: string[], hint?: string) => {
  if (repos.length === 0) throw new ApiError("Select at least one repository.", 400);
  const request = hint ? { repos, hint } : { repos };
  return { jobId: await begin("generate", (job) => runGenerate(job, request)) };
};

export const startApply = async (dryRun: boolean, repos?: string[]) => {
  const request = repos ? { repos, dryRun } : { dryRun };
  return { jobId: await begin("apply", (job) => runApply(job, request)), dryRun };
};

export async function cancelJob(id: string): Promise<JobSnapshot> {
  const job = getJob(id);
  if (!job) throw new ApiError("No such job.", 404);
  job.cancel();
  return job.get();
}

export async function getJobs(): Promise<{ current: JobSnapshot | null; recent: JobSnapshot[] }> {
  return { current: currentJob()?.get() ?? null, recent: recentJobs() };
}

/**
 * Subscribes to a running job. The job lives in this tab, so updates arrive by
 * direct call rather than over SSE; the signature is kept so callers are
 * unchanged, and the returned function still unsubscribes.
 */
export function streamJob(
  id: string,
  onUpdate: (snapshot: JobSnapshot) => void,
  onError?: (message: string) => void,
): () => void {
  const job = getJob(id);
  if (!job) {
    // A reload drops in-tab jobs; say so rather than hanging on a dead id.
    onError?.("That run is no longer available - it ended when the page was reloaded.");
    return () => {};
  }
  return job.subscribe(onUpdate);
}
