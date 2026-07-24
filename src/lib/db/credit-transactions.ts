import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

// Thrown by route handlers when reserveCredits rejects a request — callers map this to a
// 402 response, distinct from a generic generation failure (500).
export class CreditLimitError extends Error {}

// Row-locked check-and-insert via the reserve_credits RPC (migration 0020) — the org row is
// locked for the call's duration, serializing concurrent reservation attempts so the
// sum-then-insert can't race. { ok: false } (never throws for a normal cap-exceeded case)
// when the org's monthly cap would be exceeded; a null monthly_credit_limit always succeeds.
export async function reserveCredits(
  orgId: string,
  generationId: string,
  amount: number,
): Promise<{ ok: boolean }> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("reserve_credits", {
    p_org_id: orgId,
    p_generation_id: generationId,
    p_amount: amount,
  });
  if (error) throw error;
  return { ok: data === true };
}

// This generation's reservation amount, read back from the ledger (the source of truth —
// not duplicated onto the generations row). 0 if no reservation was ever made, so both
// settleGeneration and refundReservation are safe no-ops when called on a generation that
// was never actually reserved (e.g. reserveCredits itself threw before completing).
async function getReservedAmount(generationId: string): Promise<number> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("credit_transactions")
    .select("amount")
    .eq("generation_id", generationId)
    .eq("type", "reservation")
    .maybeSingle();
  if (error) throw error;
  return (data as { amount: number } | null)?.amount ?? 0;
}

// Success terminal state (design spec §4): refund the reservation AND record the actual
// cost in one insert — net ledger effect is exactly actualAmount, not the estimate. Call
// this and succeedGeneration's creditsCharged with the SAME actualAmount value.
export async function settleGeneration(input: {
  orgId: string;
  generationId: string;
  actualAmount: number;
}): Promise<void> {
  const reserved = await getReservedAmount(input.generationId);
  const supabase = createServerSupabase();
  const { error } = await supabase.from("credit_transactions").insert([
    { org_id: input.orgId, generation_id: input.generationId, amount: -reserved, type: "refund" },
    { org_id: input.orgId, generation_id: input.generationId, amount: input.actualAmount, type: "consumption" },
  ]);
  if (error) throw error;
}

// Failure/cancel terminal state (design spec §4): refund the reservation only — net ledger
// effect is zero.
export async function refundReservation(input: {
  orgId: string;
  generationId: string;
}): Promise<void> {
  const reserved = await getReservedAmount(input.generationId);
  const supabase = createServerSupabase();
  const { error } = await supabase.from("credit_transactions").insert({
    org_id: input.orgId,
    generation_id: input.generationId,
    amount: -reserved,
    type: "refund",
  });
  if (error) throw error;
}
