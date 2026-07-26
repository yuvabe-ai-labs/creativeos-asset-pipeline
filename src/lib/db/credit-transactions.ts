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

// Whether this generation already reached a terminal ledger state (a refund or consumption
// row already exists). Used as a guard so settleGeneration/refundReservation are idempotent
// when a route's catch-block cleanup runs after settlement already succeeded — without this,
// a transient error on the line right after settleGeneration (e.g. succeedGeneration) would
// trigger a second refund for the same reservation, double-crediting the org.
async function alreadySettled(generationId: string): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("credit_transactions")
    .select("id")
    .eq("generation_id", generationId)
    .in("type", ["refund", "consumption"])
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

// Success terminal state (design spec §4): refund the reservation AND record the actual
// cost in one insert — net ledger effect is exactly actualAmount, not the estimate. Call
// this and succeedGeneration's creditsCharged with the SAME actualAmount value.
export async function settleGeneration(input: {
  orgId: string;
  generationId: string;
  actualAmount: number;
}): Promise<void> {
  if (await alreadySettled(input.generationId)) return;
  const reserved = await getReservedAmount(input.generationId);
  const supabase = createServerSupabase();
  const { error } = await supabase.from("credit_transactions").insert([
    { org_id: input.orgId, generation_id: input.generationId, amount: -reserved, type: "refund" },
    { org_id: input.orgId, generation_id: input.generationId, amount: input.actualAmount, type: "consumption" },
  ]);
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

// Failure/cancel terminal state (design spec §4): refund the reservation only — net ledger
// effect is zero.
export async function refundReservation(input: {
  orgId: string;
  generationId: string;
}): Promise<void> {
  if (await alreadySettled(input.generationId)) return;
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
