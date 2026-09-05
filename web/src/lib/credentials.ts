import type { AuthStatus, GithubIdentity } from "@shared/types.js";

/**
 * The user's own keys, held in this tab and sent only to api.anthropic.com and
 * api.github.com over TLS - there is no gitms server to receive them.
 *
 * Default storage is sessionStorage, not localStorage: it is scoped to the tab
 * and cleared when the tab closes, so a key does not outlive the visit by
 * default. "Remember in this browser" moves them to localStorage, which survives
 * restarts and is readable by any script that gets to run on this origin. That
 * is the real trade, and the UI says so plainly rather than implying the browser
 * is encrypting anything, because it is not.
 */

const ANTHROPIC_KEY = "gitms.anthropicKey";
const GITHUB_KEY = "gitms.githubToken";
const IDENTITY_KEY = "gitms.githubIdentity";
const REMEMBER_KEY = "gitms.remember";

interface State {
  anthropicKey: string | null;
  githubToken: string | null;
  githubIdentity: GithubIdentity | null;
  remembered: boolean;
}

const state: State = {
  anthropicKey: null,
  githubToken: null,
  githubIdentity: null,
  remembered: false,
};

/** Private browsing and blocked-storage settings make these throw, not return null. */
function safeGet(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(store: Storage, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch {
    // Out of quota or storage disabled: the in-memory copy still works for this
    // session, so a failure to persist must not break the run in progress.
  }
}

function safeRemove(store: Storage, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    /* nothing to do */
  }
}

function readBoth(key: string): { value: string | null; persistent: boolean } {
  const persisted = safeGet(localStorage, key);
  if (persisted) return { value: persisted, persistent: true };
  return { value: safeGet(sessionStorage, key), persistent: false };
}

export function loadCredentials(): void {
  const anthropic = readBoth(ANTHROPIC_KEY);
  const github = readBoth(GITHUB_KEY);
  state.anthropicKey = anthropic.value;
  state.githubToken = github.value;
  state.remembered = safeGet(localStorage, REMEMBER_KEY) === "true";

  const raw = readBoth(IDENTITY_KEY).value;
  if (raw) {
    try {
      state.githubIdentity = JSON.parse(raw) as GithubIdentity;
    } catch {
      state.githubIdentity = null;
    }
  }
}

function store(): Storage {
  return state.remembered ? localStorage : sessionStorage;
}

/** Writes to the chosen store and clears the other, so a key is never in both. */
function persist(key: string, value: string | null): void {
  const target = store();
  const other = target === localStorage ? sessionStorage : localStorage;
  safeRemove(other, key);
  if (value === null) safeRemove(target, key);
  else safeSet(target, key, value);
}

export function setRemember(remember: boolean): void {
  state.remembered = remember;
  if (remember) safeSet(localStorage, REMEMBER_KEY, "true");
  else safeRemove(localStorage, REMEMBER_KEY);
  // Re-persist through the new target so the values follow the setting.
  persist(ANTHROPIC_KEY, state.anthropicKey);
  persist(GITHUB_KEY, state.githubToken);
  persist(
    IDENTITY_KEY,
    state.githubIdentity ? JSON.stringify(state.githubIdentity) : null,
  );
}

export function setAnthropicKey(key: string | null): void {
  state.anthropicKey = key?.trim() ? key.trim() : null;
  persist(ANTHROPIC_KEY, state.anthropicKey);
}

export function setGithubToken(token: string | null): void {
  state.githubToken = token?.trim() ? token.trim() : null;
  persist(GITHUB_KEY, state.githubToken);
  if (!state.githubToken) setGithubIdentity(null);
}

export function setGithubIdentity(identity: GithubIdentity | null): void {
  state.githubIdentity = identity;
  persist(IDENTITY_KEY, identity ? JSON.stringify(identity) : null);
}

export function getGithubIdentity(): GithubIdentity | null {
  return state.githubIdentity;
}

export function requireAnthropicKey(): string {
  if (!state.anthropicKey)
    throw new Error("No Anthropic API key configured. Open Setup and add one.");
  return state.anthropicKey;
}

export function requireGithubToken(): string {
  if (!state.githubToken)
    throw new Error("No GitHub token configured. Open Setup and add one.");
  return state.githubToken;
}

export function getCredentials(): {
  anthropicKey: string | null;
  githubToken: string | null;
} {
  return { anthropicKey: state.anthropicKey, githubToken: state.githubToken };
}

/** `sk-ant-api03-abcd...wxyz` -> `sk-ant-...wxyz` */
export function mask(value: string | null): string | null {
  if (!value) return null;
  const tail = value.slice(-4);
  const head = value.startsWith("sk-ant-") ? "sk-ant-" : value.slice(0, 4);
  return `${head}...${tail}`;
}

export function authStatus(): AuthStatus {
  return {
    anthropic: {
      present: Boolean(state.anthropicKey),
      masked: mask(state.anthropicKey),
    },
    github: {
      present: Boolean(state.githubToken),
      masked: mask(state.githubToken),
      identity: state.githubIdentity,
    },
    remembered: state.remembered,
    ready: Boolean(state.anthropicKey && state.githubToken),
  };
}

export function clearCredentials(): void {
  state.anthropicKey = null;
  state.githubToken = null;
  state.githubIdentity = null;
  for (const key of [ANTHROPIC_KEY, GITHUB_KEY, IDENTITY_KEY]) {
    safeRemove(localStorage, key);
    safeRemove(sessionStorage, key);
  }
  safeRemove(localStorage, REMEMBER_KEY);
  state.remembered = false;
}
