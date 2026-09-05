import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "./client.js";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt.js";
import { ProposalSchema, normaliseProposal, type ProposalOutput } from "./schemas.js";
import type { Evidence } from "../analyze/fingerprint.js";
import type { Effort, ModelId } from "../../shared/types.js";

export interface GenerationUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface GenerationResult {
  proposal: ProposalOutput;
  /** Normalisation notes, so nothing is silently rewritten behind the user's back. */
  notes: string[];
  usage: GenerationUsage;
}

export interface GenerateOptions {
  model: ModelId;
  effort: Effort;
  mock: boolean;
  hint?: string;
}

const MAX_OUTPUT_TOKENS = 16_000;

export async function generateProposal(
  evidence: Evidence,
  opts: GenerateOptions,
): Promise<GenerationResult> {
  if (opts.mock) return mockProposal(evidence);

  const client = anthropic();
  const response = await client.messages.parse({
    model: opts.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    // The system prompt is identical for every repo in a run, so marking it here
    // makes every request after the first a cache read.
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: buildUserMessage(evidence, opts.hint) }],
    thinking: { type: "adaptive" },
    output_config: {
      effort: opts.effort,
      format: zodOutputFormat(ProposalSchema),
    },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error(
      `The model did not return a valid proposal for ${evidence.repo.name} (stop reason: ${response.stop_reason}).`,
    );
  }

  const { value, notes } = normaliseProposal(parsed);
  return {
    proposal: value,
    notes,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

/* ------------------------------------------------------------- mock mode --- */

/**
 * Deterministic stand-in that exercises the whole pipeline for free. It only
 * restates evidence, so it is also a sanity check on the evidence bundle itself:
 * if the mock README looks empty, the real one had nothing to work with either.
 */
function mockProposal(evidence: Evidence): GenerationResult {
  const { repo, manifests, languages } = evidence;
  const primary = Object.entries(languages).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
  const deps = manifests.flatMap((m) => m.dependencies).slice(0, 8);
  const ecosystems = [...new Set(manifests.map((m) => m.ecosystem))];

  const topics = [
    primary.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    ...ecosystems,
    "mock-generated",
  ]
    .filter(Boolean)
    .slice(0, 6);
  while (topics.length < 3) topics.push(`placeholder-${topics.length}`);

  const readme = [
    `# ${repo.name}`,
    "",
    `_Mock output - generated without calling the API._`,
    "",
    "## What it does",
    "",
    `<!-- TODO: this is mock output. Run generation with mock mode off to get a real README. -->`,
    "",
    "## Tech stack",
    "",
    ...(deps.length ? deps.map((d) => `- ${d}`) : ["- (no dependency manifests found)"]),
    "",
    "## File tree sample",
    "",
    "```",
    evidence.tree.slice(0, 15).join("\n") || "(empty)",
    "```",
  ].join("\n");

  return {
    proposal: {
      description: `Mock description for ${repo.name} built from ${primary} sources`,
      topics,
      readme,
      confidence: "low",
      reasoning: "Mock mode: no model was called. Values are derived directly from the evidence.",
      unknowns: ["Everything - this is mock output and must not be applied as-is."],
    },
    notes: ["Generated in mock mode - no API call was made and nothing was charged."],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };
}
