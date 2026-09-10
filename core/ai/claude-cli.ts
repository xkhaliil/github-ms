import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Runs the Claude Code CLI as a subprocess and hands back what it printed, so
 * generation can be billed to a Claude subscription instead of API credits.
 *
 * Used from two places: `scripts/claude-bridge.ts` (the Vite dev-server plugin,
 * which relies on whatever `claude` a developer already has installed and logged
 * into locally) and `api/claude/*` (the Vercel functions that serve the same
 * endpoints on the deployed site, where there is no local login - those requests
 * carry a visitor's own `claude setup-token` token instead).
 */

/* --------------------------------------------------------- binary lookup --- */

/** Windows shims must go through a shell; a real executable must not. */
function needsShell(bin: string): boolean {
  return /\.(cmd|bat|ps1)$/i.test(bin);
}

/**
 * The VS Code extension ships its own CLI, which is the copy most people
 * actually have. Its path carries the extension version, so the newest install
 * is picked rather than a path being hard-coded.
 */
function vscodeBundledCli(): string | null {
  const root = join(homedir(), ".vscode", "extensions");
  if (!existsSync(root)) return null;

  const candidates = readdirSync(root)
    .filter((name) => name.startsWith("anthropic.claude-code-"))
    .sort()
    .reverse();

  for (const dir of candidates) {
    for (const exe of ["claude.exe", "claude"]) {
      const path = join(root, dir, "resources", "native-binary", exe);
      if (existsSync(path)) return path;
    }
  }
  return null;
}

function localInstalls(): string[] {
  const home = homedir();
  return [
    join(home, ".claude", "local", "claude.exe"),
    join(home, ".claude", "local", "claude"),
    join(home, ".local", "bin", "claude"),
    join(home, "AppData", "Roaming", "npm", "claude.cmd"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
  ];
}

/**
 * The deployed environment (a Vercel function) has no local install and no local
 * login - `@anthropic-ai/claude-code` is bundled as a regular npm dependency
 * precisely so this candidate resolves there. Reading its own `bin` field rather
 * than guessing a filename keeps this working across the per-platform native
 * binary packages it depends on.
 */
function bundledCli(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve("@anthropic-ai/claude-code/package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      bin?: string | Record<string, string>;
    };
    const rel =
      typeof pkg.bin === "string" ? pkg.bin : Object.values(pkg.bin ?? {})[0];
    if (!rel) return null;
    const bin = join(dirname(pkgPath), rel);
    return existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
}

interface Resolved {
  path: string;
  /** True when only the bundled npm package resolved - no ambient local login is possible. */
  bundled: boolean;
}

let resolved: Resolved | null | undefined;

/**
 * PATH first, so an explicitly installed CLI always wins over a bundled one.
 * GITMS_CLAUDE_BIN overrides everything, for an install in none of these places.
 * The bundled npm package is last resort, and the only thing that can resolve at
 * all in a deployed environment.
 */
export function resolveClaudeCli(): Resolved | null {
  if (resolved !== undefined) return resolved;

  const override = process.env["GITMS_CLAUDE_BIN"];
  if (override) {
    resolved = existsSync(override) ? { path: override, bundled: false } : null;
    return resolved;
  }

  const local =
    whichSync("claude") ?? localInstalls().find(existsSync) ?? vscodeBundledCli();
  if (local) {
    resolved = { path: local, bundled: false };
    return resolved;
  }

  const bundled = bundledCli();
  resolved = bundled ? { path: bundled, bundled: true } : null;
  return resolved;
}

/** `which`/`where` without a dependency, and without throwing on a miss. */
function whichSync(name: string): string | null {
  const isWindows = process.platform === "win32";
  const dirs = (process.env["PATH"] ?? "").split(isWindows ? ";" : ":");
  const exts = isWindows
    ? (process.env["PATHEXT"] ?? ".EXE;.CMD;.BAT").split(";")
    : [""];

  for (const dir of dirs) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, name + ext.toLowerCase());
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/* ------------------------------------------------------------ invocation --- */

export interface BridgeRequest {
  systemPrompt: string;
  userMessage: string;
  model: string;
  effort: string;
  /** JSON Schema the CLI enforces on its output, derived from the Zod schema. */
  schema: unknown;
}

export interface BridgeUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface BridgeResponse {
  /** The model's JSON output, still unvalidated - the browser parses it. */
  output: string;
  usage: BridgeUsage;
  /** List-price equivalent the CLI reports. Not money charged on a subscription. */
  referenceCostUsd: number;
}

export interface BridgeStatus {
  available: boolean;
  binary: string | null;
  /**
   * True when the only CLI found is the bundled npm package, meaning there is no
   * ambient local login and the caller must supply its own `claude setup-token`
   * token. False on a dev machine with a real local install, where the existing
   * `claude login` session is expected to just work.
   */
  requiresToken: boolean;
}

export function bridgeStatus(): BridgeStatus {
  const found = resolveClaudeCli();
  return {
    available: found !== null,
    binary: found?.path ?? null,
    requiresToken: found?.bundled ?? false,
  };
}

/** One repo can legitimately take minutes at high effort; the cap catches hangs. */
const TIMEOUT_MS = 280 * 1000;

export function buildArgs(req: BridgeRequest): string[] {
  return [
    "--print",
    "--output-format",
    "json",
    "--model",
    req.model,
    "--effort",
    req.effort,
    "--system-prompt",
    req.systemPrompt,
    "--json-schema",
    JSON.stringify(req.schema),
    // Structured output arrives as a tool call, so the run needs a turn to make
    // the call and a turn to hand back its result - `--max-turns 1` fails every
    // time, reporting `stop_reason: "tool_use"` and no result. This is headroom
    // for that round trip, not room to be agentic: no other tool is available.
    "--max-turns",
    "4",
    "--allowed-tools",
    "",
    "--strict-mcp-config",
  ];
}

/** A cheap, schema-free ping used only to confirm a pasted token authenticates. */
function buildPingArgs(): string[] {
  return [
    "--print",
    "--output-format",
    "json",
    "--max-turns",
    "1",
    "--allowed-tools",
    "",
    "--strict-mcp-config",
  ];
}

/**
 * `token`, when present, comes from a visitor's own `claude setup-token` and is
 * used only for this one spawn's environment - it is never logged, never written
 * to disk, and does not outlive this function call.
 */
export async function runClaude(
  req: BridgeRequest,
  token?: string,
): Promise<BridgeResponse> {
  const stdout = await spawnClaude(buildArgs(req), req.userMessage, token);
  return parseCliResult(stdout);
}

/** Runs the schema-free ping and throws if the CLI reports anything but success. */
export async function pingClaude(token?: string): Promise<void> {
  const stdout = await spawnClaude(
    buildPingArgs(),
    "Reply with the single word OK.",
    token,
  );
  const envelope = JSON.parse(stdout.trim()) as Record<string, unknown>;
  if (envelope["is_error"]) {
    throw new Error(
      String(envelope["result"] ?? "The Claude Code CLI reported an error."),
    );
  }
}

async function spawnClaude(
  args: string[],
  input: string,
  token?: string,
): Promise<string> {
  const found = resolveClaudeCli();
  if (!found) {
    throw new Error("The Claude Code CLI was not found on this machine.");
  }
  const bin = found.path;

  const child = spawn(bin, args, {
    shell: needsShell(bin),
    stdio: ["pipe", "pipe", "pipe"],
    // The CLI reads project settings from its cwd, and someone else's README has
    // nothing to do with this project - run it where there is no CLAUDE.md to inherit.
    cwd: homedir(),
    env: token
      ? { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: token }
      : process.env,
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  child.stdin.end(input);

  const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
  const code = await new Promise<number | null>((res, reject) => {
    child.on("error", reject);
    child.on("close", res);
  }).finally(() => clearTimeout(timer));

  if (code !== 0) {
    // A failed run still prints its envelope on stdout, and that envelope says far
    // more than the exit code does - so read it before falling back to stderr.
    throw new Error(
      describeEnvelopeFailure(stdout) ??
        describeCliFailure(stderr) ??
        `The Claude Code CLI exited with code ${code}.`,
    );
  }

  return stdout;
}

/**
 * The CLI prints one JSON envelope on success. `is_error` can be set on a turn
 * that still exited 0, so the envelope is checked rather than just the code.
 */
function parseCliResult(stdout: string): BridgeResponse {
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(stdout.trim()) as Record<string, unknown>;
  } catch {
    throw new Error(
      "The Claude Code CLI did not return JSON. Run it once by hand to see what it printed.",
    );
  }

  if (envelope["is_error"]) {
    throw new Error(
      String(envelope["result"] ?? "The Claude Code CLI reported an error."),
    );
  }

  const usage = (envelope["usage"] ?? {}) as Record<string, number>;
  return {
    output: String(envelope["result"] ?? ""),
    usage: {
      inputTokens: usage["input_tokens"] ?? 0,
      outputTokens: usage["output_tokens"] ?? 0,
      cacheReadTokens: usage["cache_read_input_tokens"] ?? 0,
      cacheWriteTokens: usage["cache_creation_input_tokens"] ?? 0,
    },
    referenceCostUsd: Number(envelope["total_cost_usd"] ?? 0),
  };
}

/**
 * Reads a failed run's own envelope, so the run view gets a sentence rather than
 * a wall of JSON. `stop_reason: "tool_use"` is called out by name because it has
 * exactly one cause here - the turn allowance ran out mid structured-output call.
 */
function describeEnvelopeFailure(stdout: string): string | null {
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(stdout.trim()) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (envelope["stop_reason"] === "tool_use") {
    return "Claude Code ran out of turns before returning a proposal. This is a bug in the bridge's turn allowance, not in your repo.";
  }

  const result = envelope["result"];
  if (typeof result === "string" && result.trim()) {
    return result.slice(0, 400);
  }
  return `Claude Code stopped early (${String(envelope["subtype"] ?? envelope["stop_reason"] ?? "unknown reason")}).`;
}

/** Turns the CLI's own stderr into something worth showing in the run view. */
function describeCliFailure(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/not logged in|\/login|authentication/i.test(trimmed)) {
    return "The Claude Code CLI is not authenticated. Paste a token from `claude setup-token` in Setup, or switch Settings back to the Anthropic API key.";
  }
  if (/usage limit|rate limit/i.test(trimmed)) {
    return "Your Claude subscription usage limit was reached. Wait for the reset, or switch Settings back to the API key.";
  }
  return trimmed.split("\n").slice(0, 3).join(" ").slice(0, 400);
}

/* ------------------------------------------------------------------ http --- */

export function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

export async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString();
}
