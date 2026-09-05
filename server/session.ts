import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CONFIG_DIR, CREDENTIALS_FILE } from "./paths.js";
import type { AuthStatus, GithubIdentity } from "../shared/types.js";

const execFileAsync = promisify(execFile);

export interface Credentials {
  anthropicKey: string | null;
  githubToken: string | null;
}

interface StoredCredentials {
  anthropicKey?: string;
  githubToken?: string;
}

/**
 * Credentials live in this module and nowhere else. They are held in memory for
 * the process lifetime and only persisted when the user explicitly opts in.
 * Nothing here is ever written to the data directory or to a log line.
 */
const state = {
  /** Issued once per process; every mutating request must present it. */
  sessionToken: randomBytes(32).toString("hex"),
  anthropicKey: null as string | null,
  githubToken: null as string | null,
  githubIdentity: null as GithubIdentity | null,
  remembered: false,
};

export function sessionToken(): string {
  return state.sessionToken;
}

export function isValidSession(token: string | undefined): boolean {
  if (!token || token.length !== state.sessionToken.length) return false;
  // Length is fixed and the token is not secret-by-obscurity alone (loopback +
  // Origin checks also apply), so a plain compare is adequate here.
  return token === state.sessionToken;
}

export function getCredentials(): Credentials {
  return { anthropicKey: state.anthropicKey, githubToken: state.githubToken };
}

/** Throws a clear error rather than letting a downstream SDK fail obscurely. */
export function requireAnthropicKey(): string {
  if (!state.anthropicKey) throw new Error("No Anthropic API key configured. Open Setup and add one.");
  return state.anthropicKey;
}

export function requireGithubToken(): string {
  if (!state.githubToken) throw new Error("No GitHub token configured. Open Setup and add one.");
  return state.githubToken;
}

export function setAnthropicKey(key: string | null): void {
  state.anthropicKey = key && key.trim() ? key.trim() : null;
}

export function setGithubToken(token: string | null): void {
  state.githubToken = token && token.trim() ? token.trim() : null;
  if (!state.githubToken) state.githubIdentity = null;
}

export function setGithubIdentity(identity: GithubIdentity | null): void {
  state.githubIdentity = identity;
}

export function getGithubIdentity(): GithubIdentity | null {
  return state.githubIdentity;
}

/**
 * Shows enough to recognise which key is loaded, never enough to use it.
 * `sk-ant-api03-abcd...wxyz` -> `sk-ant-...wxyz`
 */
export function mask(value: string | null): string | null {
  if (!value) return null;
  const tail = value.slice(-4);
  const head = value.startsWith("sk-ant-") ? "sk-ant-" : value.slice(0, 4);
  return `${head}...${tail}`;
}

export function authStatus(): AuthStatus {
  return {
    anthropic: { present: Boolean(state.anthropicKey), masked: mask(state.anthropicKey) },
    github: {
      present: Boolean(state.githubToken),
      masked: mask(state.githubToken),
      identity: state.githubIdentity,
    },
    remembered: state.remembered,
    ready: Boolean(state.anthropicKey && state.githubToken),
  };
}

/**
 * Best-effort lockdown of the credentials file. On POSIX this is chmod 600. On
 * Windows chmod is close to a no-op, so we strip inheritance and grant the
 * current user only. Returns false when it could not be secured, so the UI can
 * tell the truth about what protection is actually in place.
 */
async function restrictPermissions(file: string): Promise<boolean> {
  try {
    await chmod(file, 0o600);
    if (process.platform !== "win32") return true;
    const user = process.env["USERNAME"];
    if (!user) return false;
    await execFileAsync("icacls", [file, "/inheritance:r", "/grant:r", `${user}:F`], {
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

export interface PersistResult {
  saved: boolean;
  permissionsRestricted: boolean;
}

export async function persistCredentials(): Promise<PersistResult> {
  const payload: StoredCredentials = {};
  if (state.anthropicKey) payload.anthropicKey = state.anthropicKey;
  if (state.githubToken) payload.githubToken = state.githubToken;
  if (Object.keys(payload).length === 0) return { saved: false, permissionsRestricted: false };

  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await writeFile(CREDENTIALS_FILE, JSON.stringify(payload, null, 2), { mode: 0o600 });
  const permissionsRestricted = await restrictPermissions(CREDENTIALS_FILE);
  state.remembered = true;
  return { saved: true, permissionsRestricted };
}

export async function loadPersistedCredentials(): Promise<boolean> {
  try {
    const raw = await readFile(CREDENTIALS_FILE, "utf8");
    const parsed = JSON.parse(raw) as StoredCredentials;
    setAnthropicKey(parsed.anthropicKey ?? null);
    setGithubToken(parsed.githubToken ?? null);
    state.remembered = true;
    return true;
  } catch {
    return false;
  }
}

/** Clears both memory and disk. The "panic button" behind Settings. */
export async function clearCredentials(): Promise<void> {
  state.anthropicKey = null;
  state.githubToken = null;
  state.githubIdentity = null;
  state.remembered = false;
  await rm(CREDENTIALS_FILE, { force: true });
}
