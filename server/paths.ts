import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root - this file lives at <root>/server/paths.ts. */
export const PROJECT_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/** Generated proposals, evidence, audits. Gitignored. Never holds credentials. */
export const DATA_DIR = path.join(PROJECT_ROOT, ".gitms-data");

export const INVENTORY_FILE = path.join(DATA_DIR, "inventory.json");
export const AUDIT_FILE = path.join(DATA_DIR, "audit.json");
export const MANIFEST_FILE = path.join(DATA_DIR, "manifest.json");
export const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
export const REPOS_DIR = path.join(DATA_DIR, "repos");

/** Built frontend, served by Fastify in production. */
export const WEB_DIST = path.join(PROJECT_ROOT, "web", "dist");

/**
 * Credentials live outside the project directory so they can never be swept up
 * by a `git add .` in this repo.
 */
export const CONFIG_DIR = path.join(homedir(), ".gitms");
export const CREDENTIALS_FILE = path.join(CONFIG_DIR, "credentials.json");

/** Per-repo directory inside the data dir. Repo names are validated before use. */
export function repoDir(name: string): string {
  return path.join(REPOS_DIR, safeRepoName(name));
}

/**
 * GitHub repo names allow [A-Za-z0-9._-], which already excludes path separators,
 * but a leading dot or a literal ".." would still be unpleasant on disk - reject
 * anything that is not a plain segment rather than sanitising it silently.
 */
export function safeRepoName(name: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes("..")) {
    throw new Error(`Refusing to use unsafe repo name on disk: ${JSON.stringify(name)}`);
  }
  return name;
}
