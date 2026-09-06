import { describe, expect, it } from "vitest";
import { proposalJsonSchema } from "../core/ai/schemas.js";

/**
 * The Claude Code CLI validates `--json-schema` against its own resolver before it
 * runs anything. It has no local copy of the 2020-12 meta-schema, so the `$schema`
 * declaration Zod emits made it reject every request - once per repo, with nothing
 * generated. These tests pin the shape the CLI will actually accept.
 */
describe("proposalJsonSchema", () => {
  it("omits the $schema dialect declaration the CLI cannot resolve", () => {
    expect(proposalJsonSchema()).not.toHaveProperty("$schema");
  });

  it("carries no unresolvable refs anywhere in the document", () => {
    const json = JSON.stringify(proposalJsonSchema());
    expect(json).not.toContain("json-schema.org");
    expect(json).not.toContain("$ref");
  });

  it("still describes the whole proposal, so dropping $schema loosened nothing", () => {
    const schema = proposalJsonSchema();

    expect(schema["type"]).toBe("object");
    expect(schema["additionalProperties"]).toBe(false);
    expect(schema["required"]).toEqual([
      "description",
      "topics",
      "readme",
      "confidence",
      "reasoning",
      "unknowns",
    ]);

    const properties = schema["properties"] as Record<
      string,
      Record<string, unknown>
    >;
    expect(properties["description"]?.["maxLength"]).toBe(350);
    expect(properties["topics"]?.["minItems"]).toBe(3);
    expect(properties["topics"]?.["maxItems"]).toBe(6);
    expect(properties["confidence"]?.["enum"]).toEqual([
      "high",
      "medium",
      "low",
    ]);
  });

  it("is JSON-serialisable, since it crosses the wire as a CLI argument", () => {
    expect(() => JSON.stringify(proposalJsonSchema())).not.toThrow();
  });
});
