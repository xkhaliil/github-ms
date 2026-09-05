import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import { retry } from "@octokit/plugin-retry";
import type { GithubIdentity } from "../../shared/types.js";
import { requireGithubToken } from "../session.js";

/** Shape of the request descriptor the throttling plugin hands its callbacks. */
interface ThrottleOptions {
  method: string;
  url: string;
}

// The plugins add retry/throttle behaviour, not new API surface, so the client
// keeps Octokit's own type - which is also the only portable way to name it.
const ThrottledOctokit = Octokit.plugin(throttling, retry) as typeof Octokit;
export type GithubClient = Octokit;

/** Scopes a classic PAT needs for the write phase. `repo` covers all of them. */
const WRITE_SCOPES = ["repo", "public_repo"];

/**
 * `@octokit/rest` bundles the request-log plugin, which warns on every 4xx.
 * A 404 from these endpoints is not a failure - it is the answer: this repo has
 * no README, no manifest, no tree to read. Logging them made a healthy scan of
 * an undocumented account look like a wall of errors.
 *
 * Only 404s are dropped, and only when the call site already treats a 404 as a
 * normal outcome. Every other status still reaches the console, and setting
 * LOG_LEVEL=debug brings the 404s back.
 */
/** Endpoints gitms probes optimistically, where "not there" is a valid answer. */
const OPTIONAL_READS = /\/(readme|contents\/|languages|commits|git\/trees\/)/;

/**
 * True for the request-log lines that describe an expected absence rather than a
 * problem. Deliberately narrow: a 409 is only noise on a tree read (an empty
 * repository) - a 409 writing a README is a real conflict and must still print.
 */
export function isExpectedApiNoise(message: string): boolean {
  if (message.includes(" - 404")) return OPTIONAL_READS.test(message);
  if (message.includes(" - 409")) return message.includes("/git/trees/");
  return false;
}

function quietLog() {
  const verbose = process.env["LOG_LEVEL"] === "debug";
  return {
    debug: () => {},
    info: () => {},
    warn: (message: string) => {
      if (verbose || !isExpectedApiNoise(message)) console.warn(message);
    },
    error: (message: string) => console.error(message),
  };
}

export function createClient(token: string): GithubClient {
  return new ThrottledOctokit({
    auth: token,
    userAgent: "gitms",
    log: quietLog(),
    throttle: {
      // Primary rate limit: back off and retry twice, then give up loudly.
      onRateLimit: (_retryAfter: number, options: ThrottleOptions, _octokit: unknown, retryCount: number) => {
        if (retryCount < 2) return true;
        console.warn(`Rate limit hit on ${options.method} ${options.url}; giving up.`);
        return false;
      },
      // Secondary (abuse) limits are the ones that bite during bulk writes.
      onSecondaryRateLimit: (_retryAfter: number, options: ThrottleOptions, _octokit: unknown, retryCount: number) => {
        if (retryCount < 3) return true;
        console.warn(`Secondary rate limit on ${options.method} ${options.url}; giving up.`);
        return false;
      },
    },
  });
}

let cached: { token: string; client: GithubClient } | null = null;

/** Reuses one client per token so the throttling plugin can see the whole run. */
export function github(): GithubClient {
  const token = requireGithubToken();
  if (!cached || cached.token !== token) {
    cached = { token, client: createClient(token) };
  }
  return cached.client;
}

export function resetClientCache(): void {
  cached = null;
}

export interface GithubTestResult {
  identity: GithubIdentity;
  warning?: string;
}

/**
 * Verifies the token against the live API and reports what it can actually do.
 * Classic PATs advertise their scopes in a response header; fine-grained tokens
 * do not, so we say so instead of pretending we verified them.
 */
export async function testGithubToken(token: string): Promise<GithubTestResult> {
  const client = createClient(token);
  const res = await client.rest.users.getAuthenticated();
  const scopeHeader = res.headers["x-oauth-scopes"];
  const fineGrained = scopeHeader === undefined;
  const scopes = typeof scopeHeader === "string" && scopeHeader.length > 0
    ? scopeHeader.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const identity: GithubIdentity = {
    login: res.data.login,
    name: res.data.name ?? null,
    avatarUrl: res.data.avatar_url,
    publicRepos: res.data.public_repos ?? 0,
    scopes,
    fineGrained,
  };

  let warning: string | undefined;
  if (fineGrained) {
    warning =
      "Fine-grained token detected. GitHub does not report its permissions, so writes cannot be " +
      "verified up front - make sure it grants Contents: write and Administration: write.";
  } else if (!scopes.some((s) => WRITE_SCOPES.includes(s))) {
    warning =
      `This token has scopes [${scopes.join(", ") || "none"}]. Scanning and auditing will work, ` +
      "but applying changes needs the `repo` scope.";
  }

  return warning === undefined ? { identity } : { identity, warning };
}

/** Turns an Octokit error into something worth showing a human. */
export function describeGithubError(err: unknown): { error: string; hint?: string } {
  const status = (err as { status?: number })?.status;
  const message = err instanceof Error ? err.message : String(err);
  if (status === 401) {
    return {
      error: "GitHub rejected this token (401).",
      hint: "The token is wrong, revoked, or expired. Generate a new one and paste it again.",
    };
  }
  if (status === 403) {
    return {
      error: "GitHub refused the request (403).",
      hint: "Usually a missing scope or a rate limit. Check the token has the `repo` scope.",
    };
  }
  if (status === 404) {
    return { error: "Not found (404).", hint: "The repo may be private, renamed, or deleted." };
  }
  return { error: message };
}
