import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { SubscriptionStatus } from "./billing-subscriptions";

// A new plan price the owner approves, or the plan ends (migration 0104, D595).

export type ScheduledSubscription = { id: string; orgId: string; priceId: string; razorpaySubscriptionId: string | null; approvedAt: string | null };

/** The approval subscription waiting beside the agency's plan; null when there is none. */
export async function getScheduledSubscription(orgId: string): Promise<ScheduledSubscription | null> {
  const { data, error } = await createServerSupabase()
    .from("billing_subscriptions")
    .select("id, org_id, price_id, razorpay_subscription_id, approved_at")
    .eq("org_id", orgId)
    .eq("status", "scheduled")
    .maybeSingle();
  if (error) throw error;
  const r = data as { id: string; org_id: string; price_id: string; razorpay_subscription_id: string | null; approved_at: string | null } | null;
  return r ? { id: r.id, orgId: r.org_id, priceId: r.price_id, razorpaySubscriptionId: r.razorpay_subscription_id, approvedAt: r.approved_at } : null;
}

/** Records the owner's authorisation once (record_price_approval). False: not an approval waiting,
 *  or already recorded. */
export async function recordPriceApproval(razorpaySubscriptionId: string): Promise<boolean> {
  const { data, error } = await createServerSupabase().rpc("record_price_approval", { p_razorpay_subscription_id: razorpaySubscriptionId });
  if (error) throw error;
  return data === true;
}

/** The price owners can buy now for a price's product and interval: where an approval of a replaced
 *  price moves next. Null when it is still the current one (or none is shown). */
export async function getNewerPrice(priceId: string): Promise<string | null> {
  const supabase = createServerSupabase();
  const { data: price, error } = await supabase.from("billing_prices").select("product_id, interval_months, active").eq("id", priceId).maybeSingle();
  if (error) throw error;
  const p = price as { product_id: string; interval_months: number | null; active: boolean } | null;
  if (!p || p.active) return null;
  let query = supabase.from("billing_prices").select("id").eq("product_id", p.product_id).eq("active", true);
  query = p.interval_months === null ? query.is("interval_months", null) : query.eq("interval_months", p.interval_months);
  const { data: newer, error: newerError } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (newerError) throw newerError;
  return (newer as { id: string } | null)?.id ?? null;
}

export type AskedPlan = {
  id: string;
  orgId: string;
  status: SubscriptionStatus;
  razorpaySubscriptionId: string | null;
  currentPeriodEnd: string | null;
  endsAt: string;
  nextPriceId: string | null;
  refused: string | null;
  remindedAt: string | null;
};

type AskedRow = {
  id: string;
  org_id: string;
  status: SubscriptionStatus;
  razorpay_subscription_id: string | null;
  current_period_end: string | null;
  ends_unless_approved_at: string;
  next_price_id: string | null;
  next_price_refused: string | null;
  approval_reminded_at: string | null;
};

const ASKED_COLUMNS = "id, org_id, status, razorpay_subscription_id, current_period_end, ends_unless_approved_at, next_price_id, next_price_refused, approval_reminded_at";

const toAsked = (r: AskedRow): AskedPlan => ({
  id: r.id,
  orgId: r.org_id,
  status: r.status,
  razorpaySubscriptionId: r.razorpay_subscription_id,
  currentPeriodEnd: r.current_period_end,
  endsAt: r.ends_unless_approved_at,
  nextPriceId: r.next_price_id,
  refused: r.next_price_refused,
  remindedAt: r.approval_reminded_at,
});

/** One plan asked to approve, by row id; null when it has no end date (or ended). */
export async function getAskedPlan(id: string): Promise<AskedPlan | null> {
  const { data, error } = await createServerSupabase()
    .from("billing_subscriptions")
    .select(ASKED_COLUMNS)
    .eq("id", id)
    .neq("status", "ended")
    .not("ends_unless_approved_at", "is", null)
    .maybeSingle();
  if (error) throw error;
  return data ? toAsked(data as AskedRow) : null;
}

/** Running plans with an end date (asked, or approved and ending), soonest first, bounded: what the
 *  nightly check stops at the end of their final cycle. */
export async function listEndingPlans(statuses: SubscriptionStatus[], limit: number): Promise<AskedPlan[]> {
  const { data, error } = await createServerSupabase()
    .from("billing_subscriptions")
    .select(ASKED_COLUMNS)
    .in("status", statuses)
    .not("ends_unless_approved_at", "is", null)
    .order("ends_unless_approved_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as AskedRow[]).map(toAsked);
}

/** Plans still asked to approve that end by `until`, not yet reminded. */
export async function listApprovalReminders(from: string, until: string, limit: number): Promise<AskedPlan[]> {
  const { data, error } = await createServerSupabase()
    .from("billing_subscriptions")
    .select(ASKED_COLUMNS)
    .in("status", ["active", "cancelling", "payment_due"])
    .in("next_price_refused", ["upi", "emandate"])
    .not("next_price_id", "is", null)
    .is("approval_reminded_at", null)
    .gt("ends_unless_approved_at", from)
    .lte("ends_unless_approved_at", until)
    .order("ends_unless_approved_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as AskedRow[]).map(toAsked);
}

/** The agencies among `orgIds` whose new price is approved (one query for the whole list). */
export async function approvedOrgIds(orgIds: string[]): Promise<Set<string>> {
  if (orgIds.length === 0) return new Set();
  const { data, error } = await createServerSupabase()
    .from("billing_subscriptions")
    .select("org_id")
    .in("org_id", orgIds)
    .eq("status", "scheduled")
    .not("approved_at", "is", null);
  if (error) throw error;
  return new Set(((data ?? []) as { org_id: string }[]).map((r) => r.org_id));
}

/** Takes the reminder for one plan, once: false when it was already taken. */
export async function claimApprovalReminder(id: string): Promise<boolean> {
  const { data, error } = await createServerSupabase()
    .from("billing_subscriptions")
    .update({ approval_reminded_at: new Date().toISOString() })
    .eq("id", id)
    .is("approval_reminded_at", null)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}
