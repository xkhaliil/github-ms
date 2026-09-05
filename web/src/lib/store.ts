import {
  STORE_EVIDENCE,
  STORE_KV,
  STORE_PROPOSALS,
  idbClear,
  idbDelete,
  idbGet,
  idbSet,
  idbValues,
} from "./idb.js";
import {
  DEFAULT_SETTINGS,
  type AccountAudit,
  type ManifestEntry,
  type RepoProposal,
  type RepoSummary,
  type Settings,
} from "@shared/types.js";

/** Everything a run produces, kept in the browser: scan, audit, proposals, evidence. */

export interface Inventory {
  scannedAt: string;
  owner: string;
  repos: RepoSummary[];
}

const INVENTORY = "inventory";
const AUDIT = "audit";
const SETTINGS = "settings";

export const readInventory = () => idbGet<Inventory>(STORE_KV, INVENTORY);
export const writeInventory = (inv: Inventory) => idbSet(STORE_KV, INVENTORY, inv).then(() => {});

export const readAudit = () => idbGet<AccountAudit>(STORE_KV, AUDIT);
export const writeAudit = (audit: AccountAudit) => idbSet(STORE_KV, AUDIT, audit).then(() => {});

export async function readSettings(): Promise<Settings> {
  const stored = await idbGet<Partial<Settings>>(STORE_KV, SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function writeSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await readSettings()), ...patch };
  await idbSet(STORE_KV, SETTINGS, next);
  return next;
}

export async function writeProposal(proposal: RepoProposal): Promise<void> {
  await idbSet(STORE_PROPOSALS, proposal.name, proposal);
}

export const readProposal = (name: string) => idbGet<RepoProposal>(STORE_PROPOSALS, name);

export async function listProposals(): Promise<RepoProposal[]> {
  const all = await idbValues<RepoProposal>(STORE_PROPOSALS);
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function deleteProposal(name: string): Promise<void> {
  await idbDelete(STORE_PROPOSALS, name);
  await idbDelete(STORE_EVIDENCE, name);
  await idbDelete(STORE_EVIDENCE, `${name}:original-readme`);
}

/** Kept so a replaced README is still recoverable after an apply. */
export const writeOriginalReadme = (name: string, content: string) =>
  idbSet(STORE_EVIDENCE, `${name}:original-readme`, content).then(() => {});

export const readOriginalReadme = (name: string) =>
  idbGet<string>(STORE_EVIDENCE, `${name}:original-readme`);

export const writeEvidence = (name: string, evidence: unknown) =>
  idbSet(STORE_EVIDENCE, name, evidence).then(() => {});

export const readEvidence = <T>(name: string) => idbGet<T>(STORE_EVIDENCE, name);

/** Derived from the proposals, exactly as the local build derives it from files. */
export async function rebuildManifest(): Promise<ManifestEntry[]> {
  const proposals = await listProposals();
  return proposals
    .map((p) => ({
      name: p.name,
      status: p.status,
      confidence: p.confidence,
      hasReadmeProposal: p.readme.trim().length > 0,
      generatedAt: p.generatedAt,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Behind "Delete local data" in Settings. Nothing was uploaded, so this is the whole deletion. */
export async function clearAllData(): Promise<void> {
  await Promise.all([idbClear(STORE_KV), idbClear(STORE_PROPOSALS), idbClear(STORE_EVIDENCE)]);
}
