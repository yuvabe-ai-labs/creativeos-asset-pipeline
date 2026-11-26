import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { moveState, type MoveRefusal, type NextPrice } from "@/lib/billing/plan-move-copy";

// An agency's plan (billing_subscriptions, 0092) and the Razorpay events that move it (0095).
// Spec 2026-11-21-monthly-plans-design.md.

export type SubscriptionStatus = "created" | "active" | "payment_due" | "cancelling" | "ended";

export type LiveSubscription = {
  id: string;
  status: Exclude<SubscriptionStatus, "ended">;
  priceId: string;
  nextPriceId: string | null;
  /** The price it moves to from the next renewal, and whether that is set up (0103, D593). */
  next: NextPrice | null;
  planName: string | null;
  amountMinor: number | null;
  credits: number | null;
  currentPeriodEnd: string | null;
  razorpaySubscriptionId: string | null;
  /** When the payment first became due (0098); null otherwise. */
  paymentDueSince: string | null;
};

type LiveRow = {
  id: string;
  status: LiveSubscription["status"];
  price_id: string;
  next_price_id: string | null;
  next_price_scheduled_at: string | null;
  next_price_refused: MoveRefusal | null;
  current_period_end: string | null;
  razorpay_subscription_id: string | null;
  payment_due_since: string | null;
  price: PriceJoin | null;
  next_price: PriceJoin | null;
};

type PriceJoin = { amount_minor: number | string; credits: number | string; product: { name: string } | null };

/** The agency's subscription that hasn't ended, with its plan's name; null when there is none. */
export async function getLiveSubscription(orgId: string): Promise<LiveSubscription | null> {
  const { data, error } = await createServerSupabase()
    .from("billing_subscriptions")
    .select(
      "id, status, price_id, next_price_id, next_price_scheduled_at, next_price_refused, current_period_end, razorpay_subscription_id, payment_due_since, price:billing_prices!billing_subscriptions_price_id_fkey(amount_minor, credits, product:billing_products(name)), next_price:billing_prices!billing_subscriptions_next_price_id_fkey(amount_minor, credits, product:billing_products(name))",
    )
    .eq("org_id", orgId)
    .neq("status", "ended")
    .maybeSingle();
  if (error) throw error;
  const r = data as LiveRow | null;
  if (!r) return null;
  return {
    id: r.id,
    status: r.status,
    priceId: r.price_id,
    nextPriceId: r.next_price_id,
    next:
      r.next_price_id && r.next_price
        ? {
            priceId: r.next_price_id,
            planName: r.next_price.product?.name ?? null,
            amountMinor: Number(r.next_price.amount_minor),
            credits: Number(r.next_price.credits),
            state: moveState(r.next_price_scheduled_at, r.next_price_refused),
            refused: r.next_price_refused,
          }
        : null,
    planName: r.price?.product?.name ?? null,
    amountMinor: r.price ? Number(r.price.amount_minor) : null,
    credits: r.price ? Number(r.price.credits) : null,
    currentPeriodEnd: r.current_period_end,
    razorpaySubscriptionId: r.razorpay_subscription_id,
    paymentDueSince: r.payment_due_since,
  };
}

export type PurchasablePrice = {
  id: string;
  amountMinor: number;
  credits: number;
  intervalMonths: number | null;
  active: boolean;
  razorpayPlanId: string | null;
  product: { id: string; kind: "plan" | "topup"; name: string; active: boolean; orgId: string | null };
};

type PriceRow = {
  id: string;
  amount_minor: number | string;
  credits: number | string;
  interval_months: number | null;
  active: boolean;
  razorpay_plan_id: string | null;
  product: { id: string; kind: "plan" | "topup"; name: string; active: boolean; org_id: string | null } | null;
};

/** A price with its product, to check it can be bought. */
export async function getPurchasablePrice(priceId: string): Promise<PurchasablePrice | null> {
  const { data, error } = await createServerSupabase()
    .from("billing_prices")
    .select("id, amount_minor, credits, interval_months, active, razorpay_plan_id, product:billing_products(id, kind, name, active, org_id)")
    .eq("id", priceId)
    .maybeSingle();
  if (error) throw error;
  const r = data as PriceRow | null;
  if (!r || !r.product) return null;
  return {
    id: r.id,
    amountMinor: Number(r.amount_minor),
    credits: Number(r.credits),
    intervalMonths: r.interval_months,
    active: r.active,
    razorpayPlanId: r.razorpay_plan_id,
    product: { id: r.product.id, kind: r.product.kind, name: r.product.name, active: r.product.active, orgId: r.product.org_id },
  };
}

/** Saves the Razorpay plan made for a price, unless another request saved one first; returns the
 *  plan id in force. */
export async function savePriceRazorpayPlan(priceId: string, planId: string): Promise<string> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("billing_prices")
    .update({ razorpay_plan_id: planId })
    .eq("id", priceId)
    .is("razorpay_plan_id", null)
    .select("razorpay_plan_id")
    .maybeSingle();
  if (error) throw error;
  if (data) return (data as { razorpay_plan_id: string }).razorpay_plan_id;
  const { data: existing, error: readError } = await supabase.from("billing_prices").select("razorpay_plan_id").eq("id", priceId).single();
  if (readError) throw readError;
  return (existing as { razorpay_plan_id: string }).razorpay_plan_id;
}

export async function insertSubscription(row: { orgId: string; priceId: string; razorpaySubscriptionId: string }): Promise<string> {
  const { data, error } = await createServerSupabase()
    .from("billing_subscriptions")
    .insert({ org_id: row.orgId, price_id: row.priceId, razorpay_subscription_id: row.razorpaySubscriptionId, status: "created" })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/** Our side of a subscription change the owner asked for (Razorpay already agreed, so a new next
 *  price is saved as set up). */
export async function updateSubscription(
  id: string,
  change: { status?: SubscriptionStatus; cancelAtPeriodEnd?: boolean; nextPriceId?: string | null },
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (change.status) patch.status = change.status;
  if (change.status === "ended") patch.ended_at = new Date().toISOString();
  if (change.cancelAtPeriodEnd !== undefined) patch.cancel_at_period_end = change.cancelAtPeriodEnd;
  if (change.nextPriceId !== undefined) {
    patch.next_price_id = change.nextPriceId;
    patch.next_price_scheduled_at = change.nextPriceId ? new Date().toISOString() : null;
    patch.next_price_refused = null;
  }
  const { error } = await createServerSupabase().from("billing_subscriptions").update(patch).eq("id", id);
  if (error) throw error;
}

export async function recordSubscriptionCharge(c: {
  razorpaySubscriptionId: string;
  razorpayPlanId: string;
  paymentId: string;
  orderId: string | null;
  totalMinor: number;
  periodStart: string;
  periodEnd: string;
}): Promise<boolean> {
  const { data, error } = await createServerSupabase().rpc("record_subscription_charge", {
    p_razorpay_subscription_id: c.razorpaySubscriptionId,
    p_razorpay_plan_id: c.razorpayPlanId,
    p_payment_id: c.paymentId,
    p_order_id: c.orderId,
    p_total_minor: c.totalMinor,
    p_period_start: c.periodStart,
    p_period_end: c.periodEnd,
  });
  if (error) throw error;
  return data === true;
}

export async function setSubscriptionStatus(
  razorpaySubscriptionId: string,
  status: SubscriptionStatus,
  period: { start: string | null; end: string | null },
): Promise<boolean> {
  const { data, error } = await createServerSupabase().rpc("set_subscription_status", {
    p_razorpay_subscription_id: razorpaySubscriptionId,
    p_status: status,
    p_period_start: period.start,
    p_period_end: period.end,
  });
  if (error) throw error;
  return data === true;
}

/** Stores a webhook event once. "processed": seen and done before, so skip it. */
export async function storeRazorpayEvent(eventId: string, type: string, payload: unknown): Promise<"new" | "processed"> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("razorpay_events")
    .upsert({ event_id: eventId, type, payload }, { onConflict: "event_id", ignoreDuplicates: true })
    .select("event_id");
  if (error) throw error;
  if ((data ?? []).length > 0) return "new";
  // Seen before: done if it was processed; otherwise (an earlier attempt failed) try again.
  const { data: seen, error: readError } = await supabase.from("razorpay_events").select("processed_at").eq("event_id", eventId).single();
  if (readError) throw readError;
  return (seen as { processed_at: string | null }).processed_at ? "processed" : "new";
}

export async function markRazorpayEvent(eventId: string, outcome: { error: string | null }): Promise<void> {
  const patch = outcome.error ? { error: outcome.error.slice(0, 500) } : { processed_at: new Date().toISOString(), error: null };
  const { error } = await createServerSupabase().from("razorpay_events").update(patch).eq("event_id", eventId);
  if (error) throw error;
}

// ── The check against Razorpay (D585) ─────────────────────────────────────────────────────────

export type CheckableSubscription = { id: string; orgId: string; status: SubscriptionStatus; razorpaySubscriptionId: string; currentPeriodEnd: string | null; paymentDueSince: string | null };

/** Live plans to compare with Razorpay, least recently updated first, bounded per run. */
export async function listSubscriptionsToCheck(limit: number): Promise<CheckableSubscription[]> {
  const { data, error } = await createServerSupabase()
    .from("billing_subscriptions")
    .select("id, org_id, status, razorpay_subscription_id, current_period_end, payment_due_since")
    .neq("status", "ended")
    .not("razorpay_subscription_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as { id: string; org_id: string; status: SubscriptionStatus; razorpay_subscription_id: string; current_period_end: string | null; payment_due_since: string | null }[]).map((r) => ({
    id: r.id,
    orgId: r.org_id,
    status: r.status,
    razorpaySubscriptionId: r.razorpay_subscription_id,
    currentPeriodEnd: r.current_period_end,
    paymentDueSince: r.payment_due_since,
  }));
}

/** One-time orders (top-ups) still unpaid after `olderThan`, within the last `within`. */
export async function listUnpaidOrders(olderThan: string, within: string, limit: number): Promise<string[]> {
  const { data, error } = await createServerSupabase()
    .from("billing_payments")
    .select("razorpay_order_id")
    .eq("status", "created")
    .neq("kind", "plan")
    .neq("kind", "renewal")
    .lt("created_at", olderThan)
    .gte("created_at", within)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as { razorpay_order_id: string }[]).map((r) => r.razorpay_order_id);
}
