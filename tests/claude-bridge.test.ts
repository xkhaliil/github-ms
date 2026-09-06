import { describe, expect, it } from "vitest";
import { buildArgs } from "../scripts/claude-bridge.js";
import { proposalJsonSchema } from "../core/ai/schemas.js";

const request = {
  systemPrompt: "You write GitHub repository metadata.",
  userMessage: "Repository: example\nLanguages: Go 100%",
  model: "claude-sonnet-5",
  effort: "medium",
  schema: proposalJsonSchema(),
};

/** Reads the value following a flag, so order changes do not break these. */
function valueOf(args: string[], flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

describe("buildArgs", () => {
  it("allows more than one turn, since structured output costs a tool round trip", () => {
    // `--max-turns 1` fails every single call: the model spends its only turn on
    // the structured-output tool call and the run ends before the CLI can hand
    // back a result. Anything above 1 works; this pins the floor, not the number.
    const turns = Number(valueOf(buildArgs(request), "--max-turns"));
    expect(turns).toBeGreaterThan(1);
  });

  it("sends a schema the CLI's validator can resolve", () => {
    const schema = valueOf(buildArgs(request), "--json-schema");
    expect(schema).toBeDefined();
    expect(schema).not.toContain("json-schema.org");
    expect(() => JSON.parse(schema as string)).not.toThrow();
  });

  it("keeps the run non-agentic: no tools, no MCP servers", () => {
    const args = buildArgs(request);
    expect(valueOf(args, "--allowed-tools")).toBe("");
    expect(args).toContain("--strict-mcp-config");
  });

  it("passes the caller's model and effort through untouched", () => {
    const args = buildArgs(request);
    expect(valueOf(args, "--model")).toBe("claude-sonnet-5");
    expect(valueOf(args, "--effort")).toBe("medium");
    expect(valueOf(args, "--system-prompt")).toBe(request.systemPrompt);
  });

  it("asks for JSON output, which the response parser depends on", () => {
    expect(valueOf(buildArgs(request), "--output-format")).toBe("json");
    expect(buildArgs(request)).toContain("--print");
  });
});
