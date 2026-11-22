import "server-only";
import { transcribeCharge } from "@/lib/ai-models/service-price";
import { usdToFinalCredits } from "@/lib/credits/units";
import type { AiModelPrice, ProviderBill } from "@/lib/ai-models/types";
import type { GenerationRow } from "@/lib/db/types";

type Gen = Pick<GenerationRow, "id" | "model_used" | "created_at" | "org_id"> & { model_price_id?: string | null };

/**
 * D535 — what an auto-captions run is charged: the credits ElevenLabs reported, priced at the
 * plan's credit price, else the seconds allowance. Never 0 for transcribed audio because a price
 * is missing: the reserved amount is kept and no dollar cost is recorded.
 */
export async function settleTranscribe(
  input: { generation: Gen; secondsDone: number; providerCredits: number | null; providerUsd: number | null },
  deps: {
    priceFor: (g: Gen) => Promise<AiModelPrice | null>;
    reservedFor: (generationId: string, g: Gen) => Promise<number>;
  },
): Promise<{ credits: number; usd: number | null; bill: ProviderBill | null }> {
  const price = await deps.priceFor(input.generation);
  const charge = price
    ? transcribeCharge(price, { providerCredits: input.providerCredits, providerUsd: input.providerUsd, seconds: input.secondsDone })
    : null;
  if (!charge) return { credits: await deps.reservedFor(input.generation.id, input.generation), usd: null, bill: null };
  return { credits: usdToFinalCredits(charge.usd), usd: charge.usd, bill: charge.bill };
}
