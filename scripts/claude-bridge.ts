import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * A local bridge to the Claude Code CLI, so generation can run on a Claude
 * subscription instead of API credits.
 *
 * This exists only in the dev server. The deployed site is still a static bundle
 * that talks straight to api.anthropic.com with the visitor's own key - a browser
 * cannot spawn a process, so subscription-backed generation is inherently a
 * local-only capability. The client feature-detects the endpoint and says so
 * plainly when it is absent, rather than failing at the first repo.
 *
 * The prompt, the schema and the parsing all stay on the browser side: this
 * plugin only knows how to run a binary and hand back what it printed.
 */

export const BRIDGE_PREFIX = "/__gitms/claude";

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

let resolved: string | null | undefined;

/**
 * PATH first, so an explicitly installed CLI always wins over a bundled one.
 * GITMS_CLAUDE_BIN overrides everything, for an install in none of these places.
 */
export function resolveClaudeBinary(): string | null {
  if (resolved !== undefined) return resolved;

  const override = process.env["GITMS_CLAUDE_BIN"];
  if (override) {
    resolved = existsSync(override) ? override : null;
    return resolved;
  }

  resolved =
    whichSync("claude") ??
    localInstalls().find(existsSync) ??
    vscodeBundledCli() ??
    null;
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

/** One repo can legitimately take minutes at high effort; the cap catches hangs. */
const TIMEOUT_MS = 5 * 60 * 1000;

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

export async function runClaude(req: BridgeRequest): Promise<BridgeResponse> {
  const bin = resolveClaudeBinary();
  if (!bin) {
    throw new Error("The Claude Code CLI was not found on this machine.");
  }

  const child = spawn(bin, buildArgs(req), {
    shell: needsShell(bin),
    stdio: ["pipe", "pipe", "pipe"],
    // The CLI reads project settings from its cwd, and someone else's README has
    // nothing to do with this project - run it where there is no CLAUDE.md to inherit.
    cwd: homedir(),
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  child.stdin.end(req.userMessage);

  const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
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

  return parseCliResult(stdout);
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
    return "The Claude Code CLI is not logged in. Run `claude` once in a terminal and sign in.";
  }
  if (/usage limit|rate limit/i.test(trimmed)) {
    return "Your Claude subscription usage limit was reached. Wait for the reset, or switch Settings back to the API key.";
  }
  return trimmed.split("\n").slice(0, 3).join(" ").slice(0, 400);
}

/* ---------------------------------------------------------------- plugin --- */

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString();
}

export function claudeBridge(): Plugin {
  return {
    name: "gitms-claude-bridge",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(BRIDGE_PREFIX, (req, res, next) => {
        const path = (req.url ?? "/").split("?")[0];

        if (req.method === "GET" && path === "/status") {
          const binary = resolveClaudeBinary();
          json(res, 200, { available: binary !== null, binary });
          return;
        }

        if (req.method === "POST" && path === "/generate") {
          void (async () => {
            try {
              const body = JSON.parse(await readBody(req)) as BridgeRequest;
              json(res, 200, await runClaude(body));
            } catch (err) {
              json(res, 502, {
                error: err instanceof Error ? err.message : String(err),
              });
            }
          })();
          return;
        }

        next();
      });
    },
  };
}
