import "server-only";
import { after } from "next/server";
import { geminiMeters } from "@/lib/ai-models/text-usage";
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

/** Inside a request: the record is written once the response is sent, so nobody waits for it. */
export function recordAfterResponse(input: RecordCostInput | null): void {
  if (!input) return;
  try {
    after(() => recordProviderCost(input));
  } catch (e) {
    console.error("[record-cost]", "could not schedule", input.type, input.modelId, e instanceof Error ? e.message : e);
  }
}
