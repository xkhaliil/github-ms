import { SYSTEM_PROMPT, buildUserMessage } from "@core/ai/prompt.js";
import {
  ProposalSchema,
  normaliseProposal,
  proposalJsonSchema,
} from "@core/ai/schemas.js";
import type { GenerationResult } from "@core/ai/generate.js";
import type { Evidence } from "@core/analyze/fingerprint.js";
import type { Effort, ModelId } from "@shared/types.js";

/**
 * Client for the Claude Code bridge, which runs generation against a Claude
 * subscription instead of API credits. `/api/claude/*` is served by the Vite dev
 * plugin in `npm run dev` and by real Vercel functions on the deployed site - one
 * client works against both.
 *
 * The prompt and the schema are the same ones the API path uses, so a proposal is
 * built from identical instructions either way and only the transport differs.
 * Validation happens here rather than in the bridge: the CLI enforces the JSON
 * Schema, but this is the side that owns what a valid proposal is.
 */

const PREFIX = "/api/claude";

export interface BridgeStatus {
  available: boolean;
  binary: string | null;
  /** True when the deployment has no ambient login - a visitor must paste a token. */
  requiresToken: boolean;
}

interface BridgePayload {
  output: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  referenceCostUsd: number;
}

const UNAVAILABLE: BridgeStatus = {
  available: false,
  binary: null,
  requiresToken: false,
};

/**
 * Whether the Claude Code CLI is packaged and reachable at all here. Tolerant of
 * a failed fetch rather than throwing, so a misconfigured or ancient deployment
 * degrades to "unavailable" instead of breaking the Settings page.
 */
export async function bridgeStatus(): Promise<BridgeStatus> {
  try {
    const res = await fetch(`${PREFIX}/status`);
    if (!res.ok) return UNAVAILABLE;
    return (await res.json()) as BridgeStatus;
  } catch {
    return UNAVAILABLE;
  }
}

/** Runs a cheap, schema-free ping to confirm a pasted token authenticates. */
export async function pingClaudeToken(token: string): Promise<void> {
  const res = await fetch(`${PREFIX}/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ test: true, token }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `The Claude Code bridge failed (${res.status}).`);
  }
}

/**
 * `messages.parse()` does this server-side on the API path; here the CLI returns
 * schema-valid JSON as text and it is parsed against the same Zod schema, so an
 * invalid proposal fails in the same place with the same message.
 */
export async function generateViaBridge(
  evidence: Evidence,
  opts: { model: ModelId; effort: Effort; hint?: string; token?: string },
): Promise<GenerationResult> {
  const res = await fetch(`${PREFIX}/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: buildUserMessage(evidence, opts.hint),
      model: opts.model,
      effort: opts.effort,
      schema: proposalJsonSchema(),
      ...(opts.token ? { token: opts.token } : {}),
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error ?? `The Claude Code bridge failed (${res.status}).`,
    );
  }

  const payload = (await res.json()) as BridgePayload;

  let raw: unknown;
  try {
    raw = JSON.parse(payload.output);
  } catch {
    throw new Error(
      `Claude Code did not return JSON for ${evidence.repo.name}. Try again, or lower the effort in Settings.`,
    );
  }

  const parsed = ProposalSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Claude Code returned a proposal that does not fit the schema for ${evidence.repo.name}: ${parsed.error.issues[0]?.message ?? "unknown validation error"}.`,
    );
  }

  const { value, notes } = normaliseProposal(parsed.data);
  return {
    proposal: value,
    notes: [
      ...notes,
      "Generated through the Claude Code CLI - billed to your Claude subscription, not API credits.",
    ],
    usage: payload.usage,
  };
}
