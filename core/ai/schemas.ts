import * as z from "zod/v4";

/**
 * GitHub's own limits, enforced before anything is shown to the user. An invalid
 * proposal is retried rather than surfaced - it is cheaper to ask again than to
 * let a 400-character description reach the apply step and fail there.
 */
export const GITHUB_DESCRIPTION_MAX = 350;
export const TOPIC_MAX = 50;
export const MIN_TOPICS = 3;
export const MAX_TOPICS = 6;

/** GitHub normalises topics to lowercase alphanumerics and hyphens. */
export const TOPIC_PATTERN = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/;

export const TopicSchema = z
  .string()
  .max(TOPIC_MAX)
  .regex(TOPIC_PATTERN, "Topics must be lowercase, hyphen-separated, and start/end alphanumeric");

export const ProposalSchema = z.object({
  description: z
    .string()
    .min(10)
    .max(GITHUB_DESCRIPTION_MAX)
    .describe(
      "One sentence saying what this project is and does. No trailing period. " +
        "No marketing adjectives. Must be supportable by the evidence.",
    ),
  topics: z
    .array(TopicSchema)
    .min(MIN_TOPICS)
    .max(MAX_TOPICS)
    .describe("GitHub topics: the language, the framework, and the domain."),
  readme: z
    .string()
    .min(120)
    .describe("The full README in GitHub-flavoured Markdown."),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "high = the code plainly shows what this is. medium = mostly clear, some inference. " +
        "low = you had to guess; the user must review closely.",
    ),
  reasoning: z
    .string()
    .max(600)
    .describe("What in the evidence the description is based on. Cite files or dependencies."),
  unknowns: z
    .array(z.string().max(200))
    .max(6)
    .describe("Things you could not determine from the evidence and deliberately left out."),
});

export type ProposalOutput = z.infer<typeof ProposalSchema>;

export interface Normalised {
  value: ProposalOutput;
  /** Adjustments made after the model returned - shown so nothing is silently rewritten. */
  notes: string[];
}

/**
 * Post-validation cleanup for the things a schema cannot express: GitHub strips a
 * trailing period from descriptions anyway, and topics arrive in mixed case often
 * enough that normalising beats rejecting the whole response.
 */
export function normaliseProposal(output: ProposalOutput): Normalised {
  const notes: string[] = [];

  let description = output.description.trim().replace(/\s+/g, " ");
  if (description.endsWith(".") && !description.endsWith("..")) {
    description = description.slice(0, -1);
    notes.push("Removed a trailing period from the description.");
  }
  if (description.length > GITHUB_DESCRIPTION_MAX) {
    description = description.slice(0, GITHUB_DESCRIPTION_MAX).trimEnd();
    notes.push(`Description truncated to GitHub's ${GITHUB_DESCRIPTION_MAX}-character limit.`);
  }

  const seen = new Set<string>();
  const topics: string[] = [];
  for (const raw of output.topics) {
    const topic = raw
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, TOPIC_MAX);
    if (!topic || seen.has(topic) || !TOPIC_PATTERN.test(topic)) continue;
    seen.add(topic);
    topics.push(topic);
  }
  if (topics.length !== output.topics.length) {
    notes.push("Some topics were normalised or dropped to match GitHub's format.");
  }

  return {
    value: { ...output, description, topics: topics.slice(0, MAX_TOPICS) },
    notes,
  };
}
