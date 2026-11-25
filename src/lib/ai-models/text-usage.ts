// D560 — provider usage blocks as pricing meters. Pure: no provider calls, no database.
import type { ProviderBill } from "./types";

type Meters = ProviderBill["meters"];

/** Uncached input, cached input and output, zero-valued meters left out. Cached is clamped to the prompt. */
function textMeters(prompt: number, cachedRaw: number, output: number): Meters {
  const cached = Math.max(0, Math.min(prompt, cachedRaw));
  const input = prompt - cached;
  return {
    ...(input > 0 ? { input_token: input } : {}),
    ...(cached > 0 ? { cached_input_token: cached } : {}),
    ...(output > 0 ? { text_output_token: output } : {}),
  };
}

/**
 * Chat Completions usage. Input and output are always present (2b-i's pinned prompt bills carry a
 * zero input_token); only the cached meter is left out when zero.
 */
export function openAiChatMeters(usage: {
  prompt_tokens: number;
  completion_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
}): Meters {
  const cached = Math.max(0, Math.min(usage.prompt_tokens, usage.prompt_tokens_details?.cached_tokens ?? 0));
  return {
    input_token: usage.prompt_tokens - cached,
    ...(cached > 0 ? { cached_input_token: cached } : {}),
    text_output_token: usage.completion_tokens,
  };
}

/** Responses API usage. Reasoning tokens are already inside output_tokens, so they are not added. */
export function openAiResponsesMeters(usage: {
  input_tokens: number;
  output_tokens: number;
  input_tokens_details?: { cached_tokens?: number } | null;
}): Meters {
  return textMeters(usage.input_tokens, usage.input_tokens_details?.cached_tokens ?? 0, usage.output_tokens);
}

/**
 * Gemini usageMetadata (SDK camelCase). Thinking is billed at the output rate. A googleSearch
 * grounded call (KB website research) also reports `toolUsePromptTokenCount`: the search results
 * fed back to the model, billed as input. They are never cached, so cached stays clamped to the prompt.
 */
export function geminiMeters(u: {
  promptTokenCount?: number;
  cachedContentTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
}): Meters {
  const prompt = u.promptTokenCount ?? 0;
  const cached = Math.max(0, Math.min(prompt, u.cachedContentTokenCount ?? 0));
  return textMeters(
    prompt + (u.toolUsePromptTokenCount ?? 0),
    cached,
    (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
  );
}

/** What Apify said the run cost, in USD; nothing when it did not say. */
export function apifyMeters(usageTotalUsd: number | null): Meters {
  return usageTotalUsd !== null && usageTotalUsd > 0 ? { usd: usageTotalUsd } : {};
}
