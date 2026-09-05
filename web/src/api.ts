import { SESSION_HEADER } from "@shared/constants.js";
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
 * The session token is fetched once and attached to every mutating request. The
 * server issues a fresh one per process, so a stale tab gets a clear 401 telling
 * it to reload rather than silently failing.
 */
let sessionToken: string | null = null;

/**
 * In dev the Vite server is ready about a second before the API is, so the first
 * load reliably lost this race. Retry briefly rather than showing a dead-end
 * error the user can only fix by reloading.
 */
export async function initSession(attempts = 12): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch("/api/session");
      if (res.ok) {
        sessionToken = ((await res.json()) as { token: string }).token;
        return;
      }
    } catch {
      // Connection refused while the API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    "Could not reach the gitms server on port 5124. Check the terminal running `npm run dev`.",
  );
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  if (sessionToken) headers.set(SESSION_HEADER, sessionToken);

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const message =
      (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

const post = <T>(path: string, payload?: unknown) =>
  request<T>(path, { method: "POST", ...(payload ? { body: JSON.stringify(payload) } : {}) });

const put = <T>(path: string, payload: unknown) =>
  request<T>(path, { method: "PUT", body: JSON.stringify(payload) });

/* ---------------------------------------------------------------- auth --- */

export const getAuthStatus = () => request<AuthStatus>("/api/auth/status");

export const testCredential = (kind: "anthropic" | "github", value?: string) =>
  post<ConnectionTest>("/api/auth/test", value ? { kind, value } : { kind });

export const saveCredentials = (payload: {
  anthropicKey?: string;
  githubToken?: string;
  remember?: boolean;
}) => post<{ status: AuthStatus; permissionsRestricted: boolean }>("/api/auth/save", payload);

export const clearCredentials = () => post<AuthStatus>("/api/auth/clear");

/* --------------------------------------------------------------- repos --- */

export interface ReposResponse {
  scanned: boolean;
  scannedAt?: string;
  owner?: string;
  repos: RepoSummary[];
  audit: AccountAudit | null;
  priority: string[];
}

export const getRepos = () => request<ReposResponse>("/api/repos");

export interface RepoDetail {
  repo: RepoSummary;
  audit: RepoAudit;
  evidence: unknown | null;
  proposal: RepoProposal | null;
}

export const getRepo = (name: string) =>
  request<RepoDetail>(`/api/repos/${encodeURIComponent(name)}`);

/* ----------------------------------------------------------- proposals --- */

export const getProposals = () =>
  request<{ proposals: RepoProposal[]; manifest: ManifestEntry[] }>("/api/proposals");

export const updateProposal = (
  name: string,
  patch: { description?: string; topics?: string[]; readme?: string; status?: ProposalStatus },
) => put<RepoProposal>(`/api/proposals/${encodeURIComponent(name)}`, patch);

export const bulkUpdateProposals = (payload: {
  repos?: string[];
  status?: ProposalStatus;
  minConfidence?: "high" | "medium" | "low";
}) => post<{ updated: string[]; manifest: ManifestEntry[] }>("/api/proposals/bulk", payload);

export const deleteProposal = (name: string) =>
  request<{ deleted: string }>(`/api/proposals/${encodeURIComponent(name)}`, { method: "DELETE" });

/* ------------------------------------------------------------ settings --- */

export const getSettings = () => request<Settings>("/api/settings");
export const updateSettings = (patch: Partial<Settings>) => put<Settings>("/api/settings", patch);

export const getEstimate = (repos: number) =>
  request<{
    repos: number;
    model: string;
    batchMode: boolean;
    mockAi: boolean;
    estimatedCostUsd: number;
  }>(`/api/settings/estimate?repos=${repos}`);

/* ---------------------------------------------------------------- jobs --- */

export const startScan = () => post<{ jobId: string }>("/api/scan");

export const startGenerate = (repos: string[], hint?: string) =>
  post<{ jobId: string }>("/api/generate", hint ? { repos, hint } : { repos });

export const startApply = (dryRun: boolean, repos?: string[]) =>
  post<{ jobId: string; dryRun: boolean }>("/api/apply", repos ? { repos, dryRun } : { dryRun });

export const cancelJob = (id: string) => post<JobSnapshot>(`/api/jobs/${id}/cancel`);

export const getJobs = () =>
  request<{ current: JobSnapshot | null; recent: JobSnapshot[] }>("/api/jobs");

/**
 * Subscribes to a job's SSE stream. Returns an unsubscribe function; the stream
 * closes itself when the job reaches a terminal state.
 */
export function streamJob(
  id: string,
  onUpdate: (snapshot: JobSnapshot) => void,
  onError?: (message: string) => void,
): () => void {
  const source = new EventSource(`/api/jobs/${id}/stream`);
  let finished = false;

  source.onmessage = (event) => {
    const snapshot = JSON.parse(event.data as string) as JobSnapshot;
    onUpdate(snapshot);
    if (["done", "failed", "cancelled"].includes(snapshot.state)) {
      finished = true;
      source.close();
    }
  };

  source.onerror = () => {
    // The server ends the stream on completion, which surfaces here as an error
    // too - only report it when the job had not actually finished.
    source.close();
    if (!finished) onError?.("Lost connection to the job stream.");
  };

  return () => source.close();
}
