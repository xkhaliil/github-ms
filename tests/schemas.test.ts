import { describe, expect, it } from "vitest";
import {
  GITHUB_DESCRIPTION_MAX,
  ProposalSchema,
  normaliseProposal,
} from "../core/ai/schemas.js";

const valid = {
  description: "CLI that converts Postman collections into runnable pytest suites",
  topics: ["python", "cli", "testing"],
  readme:
    "# thing\n\nIt converts Postman collections into pytest suites.\n\n## Tech stack\n\n- httpx\n- pytest\n\n## Getting started\n\n`pip install -e .`",
  confidence: "high" as const,
  reasoning: "Based on pyproject.toml and src/main.py",
  unknowns: [],
};

describe("ProposalSchema", () => {
  it("accepts a well-formed proposal", () => {
    expect(ProposalSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a description over GitHub's limit", () => {
    const result = ProposalSchema.safeParse({
      ...valid,
      description: "x".repeat(GITHUB_DESCRIPTION_MAX + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects fewer than three topics", () => {
    expect(ProposalSchema.safeParse({ ...valid, topics: ["python", "cli"] }).success).toBe(false);
  });

  it("rejects more than six topics", () => {
    const topics = ["a1", "b2", "c3", "d4", "e5", "f6", "g7"];
    expect(ProposalSchema.safeParse({ ...valid, topics }).success).toBe(false);
  });

  it("rejects topics with uppercase or spaces", () => {
    expect(ProposalSchema.safeParse({ ...valid, topics: ["Python", "cli", "x"] }).success).toBe(
      false,
    );
    expect(
      ProposalSchema.safeParse({ ...valid, topics: ["machine learning", "cli", "x"] }).success,
    ).toBe(false);
  });

  it("rejects a README too short to be real", () => {
    expect(ProposalSchema.safeParse({ ...valid, readme: "# hi" }).success).toBe(false);
  });
});

describe("normaliseProposal", () => {
  it("strips a trailing period from the description", () => {
    const { value, notes } = normaliseProposal({ ...valid, description: "Does a thing." });
    expect(value.description).toBe("Does a thing");
    expect(notes.join(" ")).toMatch(/trailing period/i);
  });

  it("keeps an ellipsis intact", () => {
    const { value } = normaliseProposal({ ...valid, description: "Does a thing..." });
    expect(value.description).toBe("Does a thing...");
  });

  it("lowercases and hyphenates topics, dropping duplicates", () => {
    const { value } = normaliseProposal({
      ...valid,
      topics: ["Machine Learning", "machine-learning", "CLI"],
    });
    expect(value.topics).toEqual(["machine-learning", "cli"]);
  });

  it("truncates an over-long description rather than failing the run", () => {
    const { value, notes } = normaliseProposal({
      ...valid,
      description: `${"word ".repeat(120)}end`,
    });
    expect(value.description.length).toBeLessThanOrEqual(GITHUB_DESCRIPTION_MAX);
    expect(notes.join(" ")).toMatch(/truncated/i);
  });

  it("collapses runaway whitespace", () => {
    const { value } = normaliseProposal({ ...valid, description: "a   b\n\nc" });
    expect(value.description).toBe("a b c");
  });
});
