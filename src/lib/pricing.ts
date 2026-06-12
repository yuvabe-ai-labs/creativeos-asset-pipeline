export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

// Per-model pricing in USD per 1M tokens.
export const MODEL_PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  "gpt-5.4-mini": { inputPerM: 0.75,  outputPerM: 4.50  },
  "gpt-4.1-mini": { inputPerM: 0.40,  outputPerM: 1.60  },
  "gpt-4o-mini":  { inputPerM: 0.15,  outputPerM: 0.60  },
  "gpt-4o":       { inputPerM: 2.50,  outputPerM: 10.00 },
};

// Updated June 12 2026.
export const USD_TO_INR = 95.77;

export function computeCost(
  model: string,
  usage: TokenUsage,
): { usd: number; inr: number } | null {
  // Strip provider prefix e.g. "openai:gpt-5.4-mini" → "gpt-5.4-mini".
  const key = model.includes(":") ? model.split(":")[1] : model;
  const p = MODEL_PRICING[key ?? ""];
  if (!p) return null;
  const usd =
    (usage.prompt_tokens     / 1_000_000) * p.inputPerM +
    (usage.completion_tokens / 1_000_000) * p.outputPerM;
  return { usd, inr: usd * USD_TO_INR };
}
