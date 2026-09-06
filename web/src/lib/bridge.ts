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
 * Client for the dev server's Claude Code bridge, which runs generation against a
 * Claude subscription instead of API credits.
 *
 * The prompt and the schema are the same ones the API path uses, so a proposal is
 * built from identical instructions either way and only the transport differs.
 * Validation happens here rather than in the bridge: the CLI enforces the JSON
 * Schema, but this is the side that owns what a valid proposal is.
 */

const PREFIX = "/__gitms/claude";

interface BridgeStatus {
  available: boolean;
  binary: string | null;
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

/**
 * Whether subscription-backed generation is possible right now. False on a
 * deployed build, where the endpoint does not exist at all - hence the tolerance
 * for a failed fetch rather than an error.
 */
export async function bridgeStatus(): Promise<BridgeStatus> {
  try {
    const res = await fetch(`${PREFIX}/status`);
    if (!res.ok) return { available: false, binary: null };
    return (await res.json()) as BridgeStatus;
  } catch {
    return { available: false, binary: null };
  }
}

/**
 * `messages.parse()` does this server-side on the API path; here the CLI returns
 * schema-valid JSON as text and it is parsed against the same Zod schema, so an
 * invalid proposal fails in the same place with the same message.
 */
export async function generateViaBridge(
  evidence: Evidence,
  opts: { model: ModelId; effort: Effort; hint?: string },
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
      "Generated through the local Claude Code CLI - billed to your Claude subscription, not API credits.",
    ],
    usage: payload.usage,
  };
}
