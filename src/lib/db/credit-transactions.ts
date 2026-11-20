import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { isCreditRefusal, type CreditRefusal } from "@/lib/billing/grants";

// Thrown by route handlers when reserveCredits rejects a request — callers map this to a
// 402 response, distinct from a generic generation failure (500).
export class CreditLimitError extends Error {}

// Row-locked check-and-hold via reserve_credits_v2 (migration 0067). A managed agency is checked
// against its monthly limit as before; a paying agency's hold is taken from its grants, the one
// ending first, first. Refusals come back with the reason (never thrown); an answer the code
// doesn't know throws, so a mismatch between code and database never lets a run through.
export async function reserveCredits(
  orgId: string,
  generationId: string,
  amount: number,
): Promise<{ ok: true } | { ok: false; reason: CreditRefusal }> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("reserve_credits_v2", {
    p_org_id: orgId,
    p_generation_id: generationId,
    p_amount: amount,
  });
  if (error) throw error;
  if (data === "ok") return { ok: true };
  if (isCreditRefusal(data)) return { ok: false, reason: data };
  throw new Error(`reserve_credits_v2 answered ${JSON.stringify(data)}`);
}

// Success terminal state (design spec §4): refund the hold and record the real cost, and move the
// cost onto the grants the run held — one transaction in settle_credits (migration 0067). A
// repeat call changes nothing, so a route's catch-block cleanup after settling is safe. Call this
// and succeedGeneration's creditsCharged with the SAME actualAmount value.
export async function settleGeneration(input: {
  orgId: string;
  generationId: string;
  actualAmount: number;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc("settle_credits", {
    p_org_id: input.orgId,
    p_generation_id: input.generationId,
    p_actual: input.actualAmount,
  });
  if (error) throw error;
}

// Bulk reservation lookup for admin display (e.g. estimated-vs-consumed in the generations
// table) — one query for a whole page of rows instead of one per row.
export async function getReservationAmounts(
  generationIds: string[],
): Promise<Map<string, number>> {
  if (generationIds.length === 0) return new Map();
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("credit_transactions")
    .select("generation_id, amount")
    .in("generation_id", generationIds)
    .eq("type", "reservation");
  if (error) throw error;
  return new Map(
    ((data ?? []) as { generation_id: string; amount: number }[]).map((r) => [
      r.generation_id,
      r.amount,
    ]),
  );
}

// Failure/cancel terminal state: refund the hold and give its credits back to their grants
// (refund_credits, migration 0067). A repeat call changes nothing.
export async function refundReservation(input: {
  orgId: string;
  generationId: string;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc("refund_credits", {
    p_org_id: input.orgId,
    p_generation_id: input.generationId,
  });
  if (error) throw error;
}
