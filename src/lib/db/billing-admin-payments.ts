import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { ADMIN_PAYMENTS_PAGE_SIZE } from "@/lib/billing/usage-page-size";

// Admin › Payments (spec 2026-11-21-admin-payments-design.md, D584): money across every agency.
// Three reads in parallel, each bounded, whatever the number of agencies.

export type AdminPayment = {
  id: string;
  orgId: string;
  orgName: string;
  kind: "test" | "plan" | "renewal" | "topup";
  status: "paid" | "failed" | "refunded";
  totalMinor: number;
  name: string | null;
  at: string;
};

export type AttentionPlan = {
  orgId: string;
  orgName: string;
  planName: string | null;
  status: "payment_due" | "cancelling";
  periodEnd: string | null;
};

type PaymentRow = {
  id: string;
  org_id: string;
  kind: AdminPayment["kind"];
  status: AdminPayment["status"];
  amount_paise: number | string;
  total_minor: number | string | null;
  paid_at: string | null;
  created_at: string;
  org: { name: string } | null;
  price: { product: { name: string } | null } | null;
};

export type AdminPaymentsPage = { payments: AdminPayment[]; total: number };

/** One page of payments that went through or failed, newest first, with the total (D588). */
export async function listRecentPayments(page = 1): Promise<AdminPaymentsPage> {
  const from = (page - 1) * ADMIN_PAYMENTS_PAGE_SIZE;
  const { data, error, count } = await createServerSupabase()
    .from("billing_payments")
    .select("id, org_id, kind, status, amount_paise, total_minor, paid_at, created_at, org:organizations(name), price:billing_prices(product:billing_products(name))", { count: "exact" })
    .neq("status", "created")
    .neq("kind", "test")
    .order("created_at", { ascending: false })
    .range(from, from + ADMIN_PAYMENTS_PAGE_SIZE - 1);
  if (error) throw error;
  const payments = ((data ?? []) as unknown as PaymentRow[]).map((r) => ({
    id: r.id,
    orgId: r.org_id,
    orgName: r.org?.name ?? "Agency",
    kind: r.kind,
    status: r.status,
    totalMinor: Number(r.total_minor ?? r.amount_paise),
    name: r.price?.product?.name ?? null,
    at: r.paid_at ?? r.created_at,
  }));
  return { payments, total: count ?? payments.length };
}

/** What was paid since a moment (this month), in paise. */
export async function sumPaidSince(since: string): Promise<{ totalMinor: number; count: number }> {
  const { data, error } = await createServerSupabase()
    .from("billing_payments")
    .select("total_minor, amount_paise")
    .eq("status", "paid")
    .neq("kind", "test")
    .gte("paid_at", since);
  if (error) throw error;
  const rows = (data ?? []) as { total_minor: number | string | null; amount_paise: number | string }[];
  return { totalMinor: rows.reduce((s, r) => s + Number(r.total_minor ?? r.amount_paise), 0), count: rows.length };
}

type SubRow = {
  org_id: string;
  status: AttentionPlan["status"];
  current_period_end: string | null;
  org: { name: string } | null;
  price: { product: { name: string } | null } | null;
};

/** Plans that need a person (D588): a payment due, then plans ending (cancelled) within `days`,
 *  soonest first. Plans that simply renew need nothing and are only counted (countRenewingWithin). */
export async function listPlansNeedingAttention(days = 7): Promise<AttentionPlan[]> {
  const until = new Date(Date.now() + days * 86_400_000).toISOString();
  const { data, error } = await createServerSupabase()
    .from("billing_subscriptions")
    .select("org_id, status, current_period_end, org:organizations(name), price:billing_prices!billing_subscriptions_price_id_fkey(product:billing_products(name))")
    .or(`status.eq.payment_due,and(status.eq.cancelling,current_period_end.lte.${until})`)
    .order("current_period_end", { ascending: true })
    .limit(100);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as SubRow[]).map((r) => ({
    orgId: r.org_id,
    orgName: r.org?.name ?? "Agency",
    planName: r.price?.product?.name ?? null,
    status: r.status,
    periodEnd: r.current_period_end,
  }));
  return [...rows.filter((r) => r.status === "payment_due"), ...rows.filter((r) => r.status !== "payment_due")];
}

/** How many active plans renew within `days` — a count only, exact at any number of agencies. */
export async function countRenewingWithin(days = 7): Promise<number> {
  const until = new Date(Date.now() + days * 86_400_000).toISOString();
  const { count, error } = await createServerSupabase()
    .from("billing_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .lte("current_period_end", until);
  if (error) throw error;
  return count ?? 0;
}
