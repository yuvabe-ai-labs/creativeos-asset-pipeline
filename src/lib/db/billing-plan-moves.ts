import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { MoveRefusal, PriceMove } from "@/lib/billing/plan-move-copy";
import type { SubscriptionStatus } from "./billing-subscriptions";

// Moving the plans on a replaced price to the new one on Razorpay (migration 0103, D593).

export type PendingMove = {
  id: string;
  orgId: string;
  status: SubscriptionStatus;
  priceId: string;
  nextPriceId: string;
  razorpaySubscriptionId: string;
  currentPeriodEnd: string | null;
};

type PendingRow = {
  id: string;
  org_id: string;
  status: SubscriptionStatus;
  price_id: string;
  next_price_id: string;
  razorpay_subscription_id: string;
  current_period_end: string | null;
};

const PENDING_COLUMNS = "id, org_id, status, price_id, next_price_id, razorpay_subscription_id, current_period_end";

const toPending = (r: PendingRow): PendingMove => ({
  id: r.id,
  orgId: r.org_id,
  status: r.status,
  priceId: r.price_id,
  nextPriceId: r.next_price_id,
  razorpaySubscriptionId: r.razorpay_subscription_id,
  currentPeriodEnd: r.current_period_end,
});

/** Running plans marked to move whose move isn't set up on Razorpay yet, oldest first, bounded. */
export async function listPendingMoves(limit: number): Promise<PendingMove[]> {
  const { data, error } = await createServerSupabase()
    .from("billing_subscriptions")
    .select(PENDING_COLUMNS)
    .in("status", ["active", "payment_due"])
    .not("next_price_id", "is", null)
    .is("next_price_scheduled_at", null)
    .is("next_price_refused", null)
    .not("razorpay_subscription_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as PendingRow[]).map(toPending);
}

/** The plan as it is now, read just before Razorpay is asked: the owner may have changed it. Null
 *  when its move is no longer waiting (moved on, set up, refused or ended). */
export async function getPendingMove(id: string): Promise<PendingMove | null> {
  const { data, error } = await createServerSupabase()
    .from("billing_subscriptions")
    .select(PENDING_COLUMNS)
    .eq("id", id)
    .in("status", ["active", "payment_due"])
    .not("next_price_id", "is", null)
    .is("next_price_scheduled_at", null)
    .is("next_price_refused", null)
    .maybeSingle();
  if (error) throw error;
  return data ? toPending(data as PendingRow) : null;
}

/** The price a plan is meant to move to now; null when none (or it ended). */
export async function getNextPriceId(id: string): Promise<string | null> {
  const { data, error } = await createServerSupabase().from("billing_subscriptions").select("next_price_id, status").eq("id", id).maybeSingle();
  if (error) throw error;
  const r = data as { next_price_id: string | null; status: SubscriptionStatus } | null;
  return r && r.status !== "ended" ? r.next_price_id : null;
}

/** Saves Razorpay's answer and logs it on the agency, once (record_plan_move). False: the plan was
 *  no longer meant to move to `priceId`, or the answer was already saved. */
export async function recordPlanMove(subscriptionId: string, priceId: string, refused: MoveRefusal | null): Promise<boolean> {
  const { data, error } = await createServerSupabase().rpc("record_plan_move", {
    p_subscription_id: subscriptionId,
    p_price_id: priceId,
    p_refused: refused,
  });
  if (error) throw error;
  return data === true;
}

type MoveRow = {
  price_id: string;
  next_price_id: string;
  state: PriceMove["state"];
  refused: MoveRefusal | null;
  agencies: number | string;
  first_renewal: string | null;
  last_renewal: string | null;
  orgs: { id: string; name: string }[] | null;
};

/** Every running plan marked to move, grouped in the database (admin_price_moves): one call. */
export async function getPriceMoves(): Promise<PriceMove[]> {
  const { data, error } = await createServerSupabase().rpc("admin_price_moves");
  if (error) throw error;
  return ((data ?? []) as MoveRow[]).map((r) => ({
    priceId: r.price_id,
    nextPriceId: r.next_price_id,
    state: r.state,
    refused: r.refused,
    agencies: Number(r.agencies),
    firstRenewal: r.first_renewal,
    lastRenewal: r.last_renewal,
    orgs: r.orgs ?? [],
  }));
}
