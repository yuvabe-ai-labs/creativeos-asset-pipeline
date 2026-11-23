import "server-only";
import { priceForNewRun } from "@/lib/ai-models/run-price";
import { priceMeters } from "@/lib/ai-models/pricing";
import type { AiModelPrice, ProviderBill } from "@/lib/ai-models/types";
import { insertRecordOnlyGeneration } from "@/lib/db/generations";
import type { RecordOnlyType } from "@/lib/db/types";

type RecordCostInput = {
  orgId: string;
  clientId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  nodeId?: string | null;
  avatarId?: string | null;
  scriptId?: string | null;
  type: RecordOnlyType;
  modelId: string;
  meters: ProviderBill["meters"];
  raw?: unknown;
};

type RecordCostDeps = {
  priceFor?: typeof priceForNewRun;
  insert?: typeof insertRecordOnlyGeneration;
};

/**
 * D537 - log what a free feature's provider call cost us. Never throws, never charges.
 * A failed price lookup still records the call (unpriced); only a failed insert records nothing.
 */
export async function recordProviderCost(input: RecordCostInput, deps: RecordCostDeps = {}): Promise<void> {
  const { modelId, meters, raw, ...own } = input;
  if (!Object.values(meters).some((n) => typeof n === "number" && n > 0)) return;

  let price: AiModelPrice | null = null;
  try {
    price = await (deps.priceFor ?? priceForNewRun)(modelId);
  } catch (e) {
    console.error("[record-cost]", "price lookup failed", input.type, modelId, e instanceof Error ? e.message : e);
  }

  try {
    const priced = price ? priceMeters(price, meters) : null;
    await (deps.insert ?? insertRecordOnlyGeneration)({
      ...own,
      modelUsed: modelId,
      modelPriceId: price?.id ?? null,
      costUsd: priced && priced.unpriced.length === 0 ? priced.usd : null,
      providerBill: { source: "usd" in meters ? "provider_charge" : "provider_usage", meters, raw },
    });
  } catch (e) {
    console.error("[record-cost]", input.type, modelId, e instanceof Error ? e.message : e);
  }
}
