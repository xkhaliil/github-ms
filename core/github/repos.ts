import { github } from "./client.js";
import type { RepoFileFacts, RepoSummary, Settings } from "../../shared/types.js";

/** Root-level files that tell us something without needing to be read. */
const README_RE = /^readme(\.(md|markdown|rst|txt))?$/i;
const LICENSE_RE = /^(license|licence|copying)(\.(md|txt))?$/i;
const DEPLOY_FILES = [
  "vercel.json",
  "netlify.toml",
  "now.json",
  "render.yaml",
  "fly.toml",
  "Dockerfile",
  "docker-compose.yml",
  "CNAME",
];

export interface RepoTree {
  paths: string[];
  truncated: boolean;
  /** False when the repo is empty or the tree could not be read. */
  ok: boolean;
}

/**
 * One recursive tree call per repo. It answers the hygiene questions and doubles
 * as the file listing the evidence bundle needs, so we never pay for it twice.
 */
export async function getTree(owner: string, repo: string, branch: string): Promise<RepoTree> {
  try {
    const res = await github().rest.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: "1",
    });
    return {
      paths: res.data.tree.map((n) => n.path ?? "").filter(Boolean),
      truncated: Boolean(res.data.truncated),
      ok: true,
    };
  } catch {
    // 409 for an empty repo, 404 for a missing branch - both mean "nothing to read".
    return { paths: [], truncated: false, ok: false };
  }
}

export function deriveFileFacts(tree: RepoTree): RepoFileFacts {
  const root = tree.paths.filter((p) => !p.includes("/"));
  const deployHints = DEPLOY_FILES.filter((f) =>
    root.some((p) => p.toLowerCase() === f.toLowerCase()),
  );
  if (tree.paths.some((p) => p.startsWith("docs/") || p === "docs")) deployHints.push("docs/");

  return {
    hasReadme: root.some((p) => README_RE.test(p)),
    hasLicenseFile: root.some((p) => LICENSE_RE.test(p)),
    hasGitignore: root.includes(".gitignore"),
    hasCi: tree.paths.some((p) => p.startsWith(".github/workflows/")),
    deployHints,
    incomplete: !tree.ok || tree.truncated,
  };
}

export interface ScanOptions {
  includeForks: boolean;
  includeArchived: boolean;
  includePrivate: boolean;
}

export function scanOptionsFrom(settings: Settings): ScanOptions {
  return {
    includeForks: settings.includeForks,
    includeArchived: settings.includeArchived,
    includePrivate: settings.includePrivate,
  };
}

/** Every repo owned by the authenticated user, before filtering. */
export async function listOwnedRepos(): Promise<RepoSummary[]> {
  const client = github();
  const raw = await client.paginate(client.rest.repos.listForAuthenticatedUser, {
    affiliation: "owner",
    per_page: 100,
    sort: "pushed",
    direction: "desc",
  });

  return raw.map((r) => ({
    name: r.name,
    fullName: r.full_name,
    owner: r.owner.login,
    htmlUrl: r.html_url,
    description: r.description ?? null,
    topics: r.topics ?? [],
    language: r.language ?? null,
    stars: r.stargazers_count ?? 0,
    forks: r.forks_count ?? 0,
    isFork: Boolean(r.fork),
    isArchived: Boolean(r.archived),
    isPrivate: Boolean(r.private),
    isEmpty: (r.size ?? 0) === 0,
    defaultBranch: r.default_branch ?? "main",
    homepage: r.homepage ?? null,
    license: r.license?.spdx_id ?? null,
    createdAt: r.created_at ?? new Date(0).toISOString(),
    pushedAt: r.pushed_at ?? null,
    sizeKb: r.size ?? 0,
    // Filled in by the tree pass below.
    files: {
      hasReadme: false,
      hasLicenseFile: false,
      hasGitignore: false,
      hasCi: false,
      deployHints: [],
      incomplete: true,
    },
  }));
}

export function applyScanFilters(repos: RepoSummary[], opts: ScanOptions): RepoSummary[] {
  return repos.filter((r) => {
    if (!opts.includeForks && r.isFork) return false;
    if (!opts.includeArchived && r.isArchived) return false;
    if (!opts.includePrivate && r.isPrivate) return false;
    return true;
  });
}

/* -------------------------------------------------------- file reading --- */

export interface FileContent {
  path: string;
  text: string;
  sha: string;
}

/** Returns null for missing files, directories, and anything that is not text. */
export async function getFile(
  owner: string,
  repo: string,
  path: string,
  maxBytes = 64 * 1024,
): Promise<FileContent | null> {
  try {
    const res = await github().rest.repos.getContent({ owner, repo, path });
    const data = res.data;
    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) return null;
    if (data.size > maxBytes * 4) return null; // clearly a binary blob or a huge file
    const text = Buffer.from(data.content, data.encoding as BufferEncoding).toString("utf8");
    // A NUL byte in the first KB is the cheap, reliable binary test.
    if (text.slice(0, 1024).includes("\0")) return null;
    return { path, text: text.slice(0, maxBytes), sha: data.sha };
  } catch {
    return null;
  }
}

export interface ExistingReadme {
  path: string;
  text: string;
  sha: string;
}

/** Uses the dedicated endpoint so it finds README.md, README.rst, docs/README, etc. */
export async function getExistingReadme(
  owner: string,
  repo: string,
): Promise<ExistingReadme | null> {
  try {
    const res = await github().rest.repos.getReadme({ owner, repo });
    const text = Buffer.from(res.data.content, res.data.encoding as BufferEncoding).toString("utf8");
    return { path: res.data.path, text, sha: res.data.sha };
  } catch {
    return null;
  }
}

export async function getCommitMessages(
  owner: string,
  repo: string,
  limit = 20,
): Promise<string[]> {
  try {
    const res = await github().rest.repos.listCommits({ owner, repo, per_page: limit });
    return res.data.map((c) => c.commit.message.split("\n")[0] ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

export async function getLanguages(owner: string, repo: string): Promise<Record<string, number>> {
  try {
    const res = await github().rest.repos.listLanguages({ owner, repo });
    return res.data;
  } catch {
    return {};
  }
}
