import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicIdentity, ModelId } from "../../shared/types.js";
import { requireAnthropicKey } from "../session.js";

let cached: { key: string; client: Anthropic } | null = null;

export function anthropic(): Anthropic {
  const key = requireAnthropicKey();
  if (!cached || cached.key !== key) {
    cached = { key, client: new Anthropic({ apiKey: key }) };
  }
  return cached.client;
}

export function resetAnthropicCache(): void {
  cached = null;
}

export interface AnthropicTestResult {
  identity: AnthropicIdentity;
  warning?: string;
}

/**
 * Validates the key with a Models API call rather than a Messages call: it proves
 * authentication works and costs nothing, so testing a key is always free.
 */
export async function testAnthropicKey(
  key: string,
  desiredModel: ModelId,
): Promise<AnthropicTestResult> {
  const client = new Anthropic({ apiKey: key });
  const page = await client.models.list({ limit: 100 });
  const ids = page.data.map((m) => m.id);
  const identity: AnthropicIdentity = { model: desiredModel };

  if (!ids.includes(desiredModel)) {
    return {
      identity,
      warning:
        `Your key works, but ${desiredModel} is not in the model list for this account. ` +
        "Pick a different model in Settings if generation fails.",
    };
  }
  return { identity };
}

export function describeAnthropicError(err: unknown): { error: string; hint?: string } {
  const status = (err as { status?: number })?.status;
  const message = err instanceof Error ? err.message : String(err);
  if (status === 401) {
    return {
      error: "Anthropic rejected this API key (401).",
      hint: "Copy the key again from console.anthropic.com - it should start with `sk-ant-`.",
    };
  }
  if (status === 403) {
    return { error: "This key is not permitted to make this request (403)." };
  }
  if (status === 429) {
    return {
      error: "Rate limited by the Anthropic API (429).",
      hint: "Wait a moment and retry, or lower the model tier in Settings.",
    };
  }
  if (typeof status === "number" && status >= 500) {
    return { error: `Anthropic API error (${status}). This is usually transient - retry.` };
  }
  return { error: message };
}
