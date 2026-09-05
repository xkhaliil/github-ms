import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AUDIT_FILE,
  DATA_DIR,
  INVENTORY_FILE,
  MANIFEST_FILE,
  REPOS_DIR,
  SETTINGS_FILE,
  repoDir,
} from "../paths.js";
import {
  DEFAULT_SETTINGS,
  type AccountAudit,
  type ManifestEntry,
  type RepoProposal,
  type RepoSummary,
  type Settings,
} from "../../shared/types.js";

export interface Inventory {
  scannedAt: string;
  owner: string;
  repos: RepoSummary[];
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

export async function ensureDataDir(): Promise<void> {
  await mkdir(REPOS_DIR, { recursive: true });
}

/* ----------------------------------------------------------- inventory --- */

export const readInventory = () => readJson<Inventory>(INVENTORY_FILE);
export const writeInventory = (inv: Inventory) => writeJson(INVENTORY_FILE, inv);

export const readAudit = () => readJson<AccountAudit>(AUDIT_FILE);
export const writeAudit = (audit: AccountAudit) => writeJson(AUDIT_FILE, audit);

/* ------------------------------------------------------------ settings --- */

export async function readSettings(): Promise<Settings> {
  const stored = await readJson<Partial<Settings>>(SETTINGS_FILE);
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function writeSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await readSettings()), ...patch };
  await writeJson(SETTINGS_FILE, next);
  return next;
}

/* ----------------------------------------------------------- proposals --- */

const proposalFile = (name: string) => path.join(repoDir(name), "proposal.json");
const readmeFile = (name: string) => path.join(repoDir(name), "README.md");
const originalReadmeFile = (name: string) => path.join(repoDir(name), "README.original.md");
const evidenceFile = (name: string) => path.join(repoDir(name), "evidence.json");

/**
 * The README is stored as a real .md file rather than a JSON string field so it
 * can be opened, diffed and hand-edited outside the app.
 */
export async function writeProposal(proposal: RepoProposal): Promise<void> {
  const dir = repoDir(proposal.name);
  await mkdir(dir, { recursive: true });
  const { readme, ...rest } = proposal;
  await writeFile(proposalFile(proposal.name), JSON.stringify(rest, null, 2), "utf8");
  await writeFile(readmeFile(proposal.name), readme, "utf8");
}

export async function readProposal(name: string): Promise<RepoProposal | null> {
  const rest = await readJson<Omit<RepoProposal, "readme">>(proposalFile(name));
  if (!rest) return null;
  let readme = "";
  try {
    readme = await readFile(readmeFile(name), "utf8");
  } catch {
    readme = "";
  }
  return { ...rest, readme };
}

export async function listProposals(): Promise<RepoProposal[]> {
  let names: string[];
  try {
    names = (await readdir(REPOS_DIR, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
  const loaded = await Promise.all(names.map((n) => readProposal(n).catch(() => null)));
  return loaded.filter((p): p is RepoProposal => p !== null);
}

export async function deleteProposal(name: string): Promise<void> {
  await rm(repoDir(name), { recursive: true, force: true });
}

export const writeOriginalReadme = (name: string, content: string) =>
  writeFile(originalReadmeFile(name), content, "utf8");

export const writeEvidence = (name: string, evidence: unknown) =>
  writeJson(evidenceFile(name), evidence);

export const readEvidence = <T>(name: string) => readJson<T>(evidenceFile(name));

/* ------------------------------------------------------------ manifest --- */

/**
 * The manifest is a derived index rebuilt from the proposal files, so the files
 * on disk stay the source of truth even if you edit them by hand.
 */
export async function rebuildManifest(): Promise<ManifestEntry[]> {
  const proposals = await listProposals();
  const entries: ManifestEntry[] = proposals
    .map((p) => ({
      name: p.name,
      status: p.status,
      confidence: p.confidence,
      hasReadmeProposal: p.readme.trim().length > 0,
      generatedAt: p.generatedAt,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  await writeJson(MANIFEST_FILE, entries);
  return entries;
}

export const dataDir = DATA_DIR;
