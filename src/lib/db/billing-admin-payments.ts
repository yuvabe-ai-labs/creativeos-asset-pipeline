import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

// Admin › Payments (spec 2026-11-21-admin-payments-design.md, D525): money across every agency.
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
  status: "payment_due" | "active" | "cancelling";
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

/** The latest payments that went through or failed, newest first. */
export async function listRecentPayments(limit = 50): Promise<AdminPayment[]> {
  const { data, error } = await createServerSupabase()
    .from("billing_payments")
    .select("id, org_id, kind, status, amount_paise, total_minor, paid_at, created_at, org:organizations(name), price:billing_prices(product:billing_products(name))")
    .neq("status", "created")
    .neq("kind", "test")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as PaymentRow[]).map((r) => ({
    id: r.id,
    orgId: r.org_id,
    orgName: r.org?.name ?? "Agency",
    kind: r.kind,
    status: r.status,
    totalMinor: Number(r.total_minor ?? r.amount_paise),
    name: r.price?.product?.name ?? null,
    at: r.paid_at ?? r.created_at,
  }));
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

/** Plans with a payment due, then plans renewing (or ending) within `days`, soonest first. */
export async function listPlansNeedingAttention(days = 7): Promise<AttentionPlan[]> {
  const until = new Date(Date.now() + days * 86_400_000).toISOString();
  const { data, error } = await createServerSupabase()
    .from("billing_subscriptions")
    .select("org_id, status, current_period_end, org:organizations(name), price:billing_prices!billing_subscriptions_price_id_fkey(product:billing_products(name))")
    .or(`status.eq.payment_due,and(status.in.(active,cancelling),current_period_end.lte.${until})`)
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
