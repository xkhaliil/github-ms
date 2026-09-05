import type { ModelId, UsageTotals } from "../../shared/types.js";

/**
 * USD per million tokens. Cache multipliers follow Anthropic's standard rates:
 * a 5-minute cache write costs 1.25x base input, a cache read 0.1x.
 */
const RATES: Record<ModelId, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
};

export function emptyUsage(): UsageTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    estimatedCostUsd: 0,
  };
}

export function costOf(usage: Omit<UsageTotals, "estimatedCostUsd">, model: ModelId, batch: boolean): number {
  const rate = RATES[model];
  const perMillion =
    usage.inputTokens * rate.input +
    usage.outputTokens * rate.output +
    usage.cacheReadTokens * rate.input * 0.1 +
    usage.cacheWriteTokens * rate.input * 1.25;
  const cost = perMillion / 1_000_000;
  return batch ? cost / 2 : cost;
}

/**
 * Pre-run estimate shown before you spend anything. Based on the observed shape
 * of a repo request: a large cached system prefix plus ~20K of evidence in,
 * ~3K of README out.
 */
export function estimateRun(repoCount: number, model: ModelId, batch: boolean): number {
  const per = costOf(
    { inputTokens: 18_000, outputTokens: 3_000, cacheReadTokens: 2_000, cacheWriteTokens: 0 },
    model,
    batch,
  );
  return per * repoCount;
}

export function addUsage(
  totals: UsageTotals,
  delta: Partial<Omit<UsageTotals, "estimatedCostUsd">>,
  model: ModelId,
  batch: boolean,
): UsageTotals {
  const next = {
    inputTokens: totals.inputTokens + (delta.inputTokens ?? 0),
    outputTokens: totals.outputTokens + (delta.outputTokens ?? 0),
    cacheReadTokens: totals.cacheReadTokens + (delta.cacheReadTokens ?? 0),
    cacheWriteTokens: totals.cacheWriteTokens + (delta.cacheWriteTokens ?? 0),
  };
  return { ...next, estimatedCostUsd: costOf(next, model, batch) };
}
