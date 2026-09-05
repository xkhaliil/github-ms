import {
  getCommitMessages,
  getExistingReadme,
  getFile,
  getLanguages,
  getTree,
  type RepoTree,
} from "../github/repos.js";
import type { GithubClient } from "../github/client.js";
import {
  MANIFEST_FILES,
  parseManifest,
  type ParsedManifest,
} from "./manifests.js";
import type { RepoSummary } from "../../shared/types.js";

/**
 * Everything the model is allowed to know about a repo. Persisted next to the
 * proposal so a wrong answer can always be traced back to what it was shown.
 */
export interface Evidence {
  repo: {
    name: string;
    owner: string;
    description: string | null;
    topics: string[];
    homepage: string | null;
    license: string | null;
    stars: number;
    createdAt: string;
    pushedAt: string | null;
    defaultBranch: string;
    isFork: boolean;
    isArchived: boolean;
  };
  languages: Record<string, number>;
  /** Trimmed file tree - directories first, then files, capped. */
  tree: string[];
  treeTruncated: boolean;
  manifests: ParsedManifest[];
  existingReadme: { path: string; text: string } | null;
  entrypoints: { path: string; text: string }[];
  commitMessages: string[];
  /** Bytes of evidence actually collected, for the cost meter and debugging. */
  bytes: number;
}

const MAX_TREE_ENTRIES = 300;
const MAX_TREE_DEPTH = 2;
const MAX_ENTRYPOINTS = 5;
const MAX_ENTRYPOINT_BYTES = 6_000;
const MAX_README_BYTES = 12_000;
const MAX_TOTAL_BYTES = 40_000;

/** Directories that say nothing about what a project does. */
const NOISE = [
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  "vendor/",
  "target/",
  "__pycache__/",
  ".venv/",
  "venv/",
  ".next/",
  "coverage/",
  ".idea/",
  ".vscode/",
];

const ENTRY_PATTERNS = [
  /^(src\/)?(index|main|app|cli|server)\.(ts|tsx|js|jsx|mjs|py|go|rs|rb|java|php)$/i,
  /^(src\/)?__main__\.py$/i,
  /^(src\/)?main\/.*\.(java|kt)$/i,
  /^app\.(py|js|ts)$/i,
  /^cmd\/[^/]+\/main\.go$/i,
];

export function trimTree(tree: RepoTree): {
  paths: string[];
  truncated: boolean;
} {
  const kept = tree.paths
    .filter((p) => !NOISE.some((n) => p.startsWith(n) || p.includes(`/${n}`)))
    .filter((p) => p.split("/").length <= MAX_TREE_DEPTH + 1)
    .sort();
  return {
    paths: kept.slice(0, MAX_TREE_ENTRIES),
    truncated: tree.truncated || kept.length > MAX_TREE_ENTRIES,
  };
}

export function pickEntrypoints(paths: string[]): string[] {
  const matched = paths.filter((p) => ENTRY_PATTERNS.some((re) => re.test(p)));
  if (matched.length >= MAX_ENTRYPOINTS)
    return matched.slice(0, MAX_ENTRYPOINTS);

  // Fall back to shallow source files - shallower paths are usually more central.
  const fallback = paths
    .filter((p) =>
      /\.(ts|tsx|js|jsx|py|go|rs|rb|java|php|c|cpp|cs|swift|kt)$/i.test(p),
    )
    .filter((p) => !matched.includes(p))
    .sort(
      (a, b) =>
        a.split("/").length - b.split("/").length || a.length - b.length,
    );

  return [...matched, ...fallback].slice(0, MAX_ENTRYPOINTS);
}

export async function buildEvidence(
  gh: GithubClient,
  repo: RepoSummary,
): Promise<Evidence> {
  const { owner, name } = repo;
  const tree = await getTree(gh, owner, name, repo.defaultBranch);
  const trimmed = trimTree(tree);

  const [languages, commitMessages, readme] = await Promise.all([
    getLanguages(gh, owner, name),
    getCommitMessages(gh, owner, name, 20),
    getExistingReadme(gh, owner, name),
  ]);

  // Only fetch manifests that the tree says exist - no speculative 404s.
  const manifestPaths = tree.paths.filter((p) =>
    (MANIFEST_FILES as readonly string[]).includes(p),
  );
  const manifestFiles = await Promise.all(
    manifestPaths.map((p) => getFile(gh, owner, name, p, 32_000)),
  );
  const manifests = manifestFiles
    .map((f) => (f ? parseManifest(f.path, f.text) : null))
    .filter((m): m is ParsedManifest => m !== null);

  let budget = MAX_TOTAL_BYTES;
  const existingReadme = readme
    ? { path: readme.path, text: readme.text.slice(0, MAX_README_BYTES) }
    : null;
  if (existingReadme) budget -= existingReadme.text.length;

  const entrypoints: { path: string; text: string }[] = [];
  for (const path of pickEntrypoints(trimmed.paths)) {
    if (budget <= MAX_ENTRYPOINT_BYTES) break;
    const file = await getFile(gh, owner, name, path, MAX_ENTRYPOINT_BYTES);
    if (!file) continue;
    entrypoints.push({ path: file.path, text: file.text });
    budget -= file.text.length;
  }

  const evidence: Evidence = {
    repo: {
      name: repo.name,
      owner: repo.owner,
      description: repo.description,
      topics: repo.topics,
      homepage: repo.homepage,
      license: repo.license,
      stars: repo.stars,
      createdAt: repo.createdAt,
      pushedAt: repo.pushedAt,
      defaultBranch: repo.defaultBranch,
      isFork: repo.isFork,
      isArchived: repo.isArchived,
    },
    languages,
    tree: trimmed.paths,
    treeTruncated: trimmed.truncated,
    manifests,
    existingReadme,
    entrypoints,
    commitMessages,
    bytes: 0,
  };
  evidence.bytes = JSON.stringify(evidence).length;
  return evidence;
}

/**
 * True when there is genuinely too little to describe. Generating a README from
 * nothing is exactly how invented content gets onto a profile, so these repos are
 * skipped and reported instead.
 */
export function isTooThin(evidence: Evidence): boolean {
  const hasCode =
    evidence.entrypoints.length > 0 || evidence.manifests.length > 0;
  const hasFiles = evidence.tree.length > 2;
  return !hasCode && !hasFiles;
}
