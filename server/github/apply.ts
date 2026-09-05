import { github } from "./client.js";
import { getExistingReadme } from "./repos.js";

/**
 * Every write to GitHub goes through this module. Keeping them in one place means
 * the safety rules - no force pushes, always pass the sha, back up first - are
 * enforced in one reviewable file rather than scattered through the pipeline.
 */

export interface MetadataUpdate {
  description?: string;
  homepage?: string;
}

export async function updateMetadata(
  owner: string,
  repo: string,
  update: MetadataUpdate,
): Promise<void> {
  await github().rest.repos.update({ owner, repo, ...update });
}

/**
 * GitHub's topics endpoint replaces the whole set, so callers must pass the union
 * of existing and new topics if they want to keep the old ones.
 */
export async function replaceTopics(
  owner: string,
  repo: string,
  topics: string[],
): Promise<string[]> {
  const res = await github().rest.repos.replaceAllTopics({ owner, repo, names: topics });
  return res.data.names;
}

export interface ReadmeWriteResult {
  sha: string;
  htmlUrl: string | null;
  /** The previous content, when one existed - the caller backs it up before we write. */
  replaced: boolean;
}

/**
 * Creates or updates README.md on the default branch.
 *
 * The `sha` of the current file is always passed when replacing. If someone else
 * changed the README since it was read, GitHub rejects the write with a 409
 * instead of silently overwriting their work. There is no force path.
 */
export async function commitReadme(
  owner: string,
  repo: string,
  content: string,
  branch: string,
  existingSha: string | null,
): Promise<ReadmeWriteResult> {
  const res = await github().rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: "README.md",
    branch,
    message: existingSha
      ? "docs: update README\n\nGenerated with gitms and reviewed before commit."
      : "docs: add README\n\nGenerated with gitms and reviewed before commit.",
    content: Buffer.from(content, "utf8").toString("base64"),
    ...(existingSha ? { sha: existingSha } : {}),
  });

  return {
    sha: res.data.content?.sha ?? "",
    htmlUrl: res.data.content?.html_url ?? null,
    replaced: Boolean(existingSha),
  };
}

/**
 * Reads the current README so we can pass its sha and keep a backup. Returns null
 * when there is none, which is the create-not-update case.
 */
export async function currentReadme(owner: string, repo: string) {
  const readme = await getExistingReadme(owner, repo);
  // Only README.md at the repo root can be updated in place; anything else
  // (README.rst, docs/README.md) would be a new file alongside it.
  if (readme && readme.path !== "README.md") {
    return { ...readme, updatable: false as const };
  }
  return readme ? { ...readme, updatable: true as const } : null;
}
