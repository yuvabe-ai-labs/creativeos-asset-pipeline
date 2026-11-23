import "server-only";
import { after } from "next/server";
import { geminiMeters, openAiChatMeters, openAiResponsesMeters } from "@/lib/ai-models/text-usage";
import type { RecordOnlyType } from "@/lib/db/types";
import { recordProviderCost, type RecordCostInput } from "./record-cost";

/**
 * D537 — whom a free feature's provider call is recorded for, built from what the route (or the
 * job row) already resolved; never resolved again. A caller that passes none records nothing.
 */
export type RecordFor = {
  orgId: string;
  clientId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  scriptId?: string | null;
  avatarId?: string | null;
  nodeId?: string | null;
};

/** Gemini's usageMetadata, as the SDK returns it. */
export type GeminiUsage = Parameters<typeof geminiMeters>[0];

/** One Gemini call's record, or null when no one is named or Gemini reported no usage. */
export function geminiCost(
  recordFor: RecordFor | undefined,
  type: RecordOnlyType,
  model: string,
  usage: GeminiUsage | null | undefined,
): RecordCostInput | null {
  if (!recordFor || !usage) return null;
  return { ...recordFor, type, modelId: `gemini:${model}`, meters: geminiMeters(usage), raw: usage };
}

/** OpenAI's `usage` block, as the SDK returns it: Chat Completions, or the Responses API. */
export type OpenAiChatUsage = Parameters<typeof openAiChatMeters>[0];
export type OpenAiResponsesUsage = Parameters<typeof openAiResponsesMeters>[0];

/** One OpenAI call's record, or null when no one is named or OpenAI reported no usage. */
export function openAiCost(
  recordFor: RecordFor | undefined, type: RecordOnlyType, model: string,
  usage: OpenAiChatUsage | null | undefined, api: "chat",
): RecordCostInput | null;
export function openAiCost(
  recordFor: RecordFor | undefined, type: RecordOnlyType, model: string,
  usage: OpenAiResponsesUsage | null | undefined, api: "responses",
): RecordCostInput | null;
export function openAiCost(
  recordFor: RecordFor | undefined,
  type: RecordOnlyType,
  model: string,
  usage: OpenAiChatUsage | OpenAiResponsesUsage | null | undefined,
  api: "chat" | "responses",
): RecordCostInput | null {
  if (!recordFor || !usage) return null;
  const meters = api === "chat"
    ? openAiChatMeters(usage as OpenAiChatUsage)
    : openAiResponsesMeters(usage as OpenAiResponsesUsage);
  return { ...recordFor, type, modelId: `openai:${model}`, meters, raw: usage };
}

/**
 * Inside a request only: the record is written without the response waiting for it. It takes the
 * promise form of `after`, which goes straight to the platform's waitUntil. The callback form waits
 * for the response to close, and a stream whose client has already gone never closes it again, so
 * that record would be lost. recordProviderCost never rejects. A Trigger task awaits
 * recordProviderCost itself, because a task has no request for `after` to attach to.
 */
export function recordAfterResponse(input: RecordCostInput | null): void {
  if (!input) return;
  try {
    after(recordProviderCost(input));
  } catch (e) {
    console.error("[record-cost]", "could not schedule", input.type, input.modelId, e instanceof Error ? e.message : e);
  }
}
