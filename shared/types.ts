/**
 * The shared vocabulary between the core engine and the React UI.
 * Both sides import from here so a shape change breaks the typecheck, not runtime.
 */

/* ---------------------------------------------------------------- auth --- */

export type CredentialKind = "anthropic" | "github";

export interface GithubIdentity {
  login: string;
  name: string | null;
  avatarUrl: string;
  publicRepos: number;
  /** Scopes granted to a classic PAT. Empty for fine-grained tokens, which do not report scopes. */
  scopes: string[];
  /** True when the token is fine-grained (no x-oauth-scopes header), so scopes cannot be pre-verified. */
  fineGrained: boolean;
}

export interface AnthropicIdentity {
  /** Model the ping was answered by - proves the key works against a real request. */
  model: string;
}

export type ConnectionTest =
  | { ok: true; kind: "github"; identity: GithubIdentity; warning?: string }
  | {
      ok: true;
      kind: "anthropic";
      identity: AnthropicIdentity;
      warning?: string;
    }
  | { ok: false; kind: CredentialKind; error: string; hint?: string };

export interface AuthStatus {
  /** Masked previews only - full key values never travel back to the browser. */
  anthropic: { present: boolean; masked: string | null };
  github: {
    present: boolean;
    masked: string | null;
    identity: GithubIdentity | null;
  };
  /** True when credentials were loaded from (or saved to) the on-disk file. */
  remembered: boolean;
  ready: boolean;
}

/* --------------------------------------------------------------- repos --- */

export interface RepoSummary {
  name: string;
  fullName: string;
  owner: string;
  htmlUrl: string;
  description: string | null;
  topics: string[];
  language: string | null;
  stars: number;
  forks: number;
  isFork: boolean;
  isArchived: boolean;
  isPrivate: boolean;
  isEmpty: boolean;
  defaultBranch: string;
  homepage: string | null;
  license: string | null;
  createdAt: string;
  pushedAt: string | null;
  sizeKb: number;
  /** Derived from a single root-tree call during the scan. */
  files: RepoFileFacts;
}

export interface RepoFileFacts {
  hasReadme: boolean;
  hasLicenseFile: boolean;
  hasGitignore: boolean;
  hasCi: boolean;
  /** Config files that imply the project is deployed somewhere public. */
  deployHints: string[];
  /** True when the tree call could not complete (empty repo, or GitHub truncated it). */
  incomplete: boolean;
}

export type IssueSeverity = "high" | "medium" | "low";

export interface HygieneIssue {
  code: string;
  severity: IssueSeverity;
  title: string;
  fix: string;
  /** True when gitms can fix this itself; false when it needs a human decision. */
  automatable: boolean;
}

export interface RepoAudit {
  name: string;
  /** 0-100. Higher is healthier. */
  score: number;
  issues: HygieneIssue[];
}

export interface AccountAudit {
  scannedAt: string;
  owner: string;
  totals: {
    repos: number;
    missingDescription: number;
    missingTopics: number;
    missingReadme: number;
    missingLicense: number;
    stale: number;
  };
  averageScore: number;
  repos: RepoAudit[];
}

/* ----------------------------------------------------------- proposals --- */

export type ProposalStatus =
  | "pending"
  | "approved"
  | "skipped"
  | "applied"
  | "failed";

export type Confidence = "high" | "medium" | "low";

export interface RepoProposal {
  name: string;
  status: ProposalStatus;
  description: string;
  topics: string[];
  readme: string;
  confidence: Confidence;
  /** The model's own account of what it based the description on. Shown in the UI. */
  reasoning: string;
  /** Things the model could not determine from the code - surfaced as review prompts. */
  unknowns: string[];
  generatedAt: string;
  model: string;
  /** Set once applied, so re-runs are idempotent. */
  applied?: {
    at: string;
    readmeSha: string | null;
    metadataUpdated: boolean;
  };
  error?: string;
}

export interface ManifestEntry {
  name: string;
  status: ProposalStatus;
  confidence: Confidence | null;
  hasReadmeProposal: boolean;
  generatedAt: string | null;
}

/* -------------------------------------------------------------- jobs --- */

export type JobKind = "scan" | "generate" | "apply";
export type JobState = "queued" | "running" | "done" | "failed" | "cancelled";

export interface JobStep {
  repo: string;
  state: "pending" | "running" | "done" | "failed" | "skipped";
  message?: string;
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostUsd: number;
}

export interface JobSnapshot {
  id: string;
  kind: JobKind;
  state: JobState;
  startedAt: string;
  finishedAt: string | null;
  total: number;
  completed: number;
  steps: JobStep[];
  usage: UsageTotals;
  error: string | null;
  /**
   * Which provider ran the job. On `claude-code` the usage figures are real but
   * the dollar total is only a list-price equivalent, since the run was billed to
   * a subscription - the run view says so rather than reporting money spent.
   */
  provider: Provider;
  /** Populated for apply jobs run with dryRun: the calls that would have been made. */
  plannedCalls?: PlannedCall[];
}

export interface PlannedCall {
  repo: string;
  method: string;
  path: string;
  summary: string;
}

/* ------------------------------------------------------------ settings --- */

export const MODELS = ["claude-opus-5", "claude-sonnet-5"] as const;
export type ModelId = (typeof MODELS)[number];

export const EFFORTS = ["low", "medium", "high"] as const;
export type Effort = (typeof EFFORTS)[number];

/**
 * Where generation gets its model from. `api` is the deployable path: the browser
 * calls api.anthropic.com with the visitor's own key, billed against API credits.
 * `claude-code` runs the local Claude Code CLI instead, which bills against a
 * Claude subscription - it needs the dev server's bridge, so it is unavailable on
 * a deployed copy of the site.
 */
export const PROVIDERS = ["api", "claude-code"] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface Settings {
  provider: Provider;
  model: ModelId;
  effort: Effort;
  /** Route generation through the Batch API at 50% cost. */
  batchMode: boolean;
  /** Use the fixture responder instead of the real API - free, for testing the flow. */
  mockAi: boolean;
  includeForks: boolean;
  includeArchived: boolean;
  includePrivate: boolean;
  /** Overwrite a README that already exists, instead of skipping the repo. */
  overwriteExistingReadme: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  provider: "api",
  model: "claude-opus-5",
  effort: "medium",
  batchMode: false,
  mockAi: false,
  includeForks: false,
  includeArchived: false,
  includePrivate: false,
  overwriteExistingReadme: false,
};
