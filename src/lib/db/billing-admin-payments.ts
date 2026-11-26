import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { ADMIN_PAYMENTS_PAGE_SIZE } from "@/lib/billing/usage-page-size";
import { PAYMENT_TABS, likeText, paymentRangeBounds, type PaymentFilters, type PaymentStatus, type PaymentTab } from "@/lib/billing/admin-payments-filters";

// Admin › Payments (D584, D592): money across every agency. Each read is bounded or grouped in the
// database, whatever the number of agencies.

export type AdminPayment = {
  id: string;
  orgId: string;
  orgName: string;
  kind: "test" | "plan" | "renewal" | "topup";
  status: PaymentStatus;
  /** With GST. */
  totalMinor: number;
  /** Before GST; null when the payment kept no tax split. */
  beforeGstMinor: number | null;
  name: string | null;
  at: string;
};

export type AttentionPlan = {
  orgId: string;
  orgName: string;
  planName: string | null;
  status: "payment_due" | "cancelling";
  periodEnd: string | null;
  /** The plan's monthly price, before GST. */
  amountMinor: number | null;
  paymentDueSince: string | null;
};

type PaymentRow = {
  id: string;
  org_id: string;
  kind: AdminPayment["kind"];
  status: PaymentStatus;
  amount_paise: number | string;
  total_minor: number | string | null;
  paid_at: string | null;
  created_at: string;
  org: { name: string } | null;
  price: { product: { name: string } | null } | null;
};

/** Payments by status for the tabs and totals; amounts include GST. */
export type PaymentTotals = { counts: Record<PaymentTab, number>; amounts: Record<PaymentStatus, number> };

export type AdminPaymentsPage = { payments: AdminPayment[]; total: number; totals: PaymentTotals };

const toPayment = (r: PaymentRow): AdminPayment => ({
  id: r.id,
  orgId: r.org_id,
  orgName: r.org?.name ?? "Agency",
  kind: r.kind,
  status: r.status,
  totalMinor: Number(r.total_minor ?? r.amount_paise),
  beforeGstMinor: r.total_minor === null ? null : Number(r.amount_paise),
  name: r.price?.product?.name ?? null,
  at: r.paid_at ?? r.created_at,
});

/** One page of the ledger for the filters, newest first, with how many match (D588). */
export async function listPayments(f: PaymentFilters): Promise<{ payments: AdminPayment[]; total: number }> {
  const from = (f.page - 1) * ADMIN_PAYMENTS_PAGE_SIZE;
  const { from: start, to: end } = paymentRangeBounds(f.range);
  const q = likeText(f.query);
  // !inner only when searching, so the agency's name can filter the payments.
  const org = q ? "org:organizations!inner(name)" : "org:organizations(name)";
  let query = createServerSupabase()
    .from("billing_payments")
    .select(`id, org_id, kind, status, amount_paise, total_minor, paid_at, created_at, ${org}, price:billing_prices(product:billing_products(name))`, { count: "exact" })
    .neq("kind", "test");
  if (f.tab !== "all") query = query.eq("status", f.tab);
  if (start) query = query.gte("created_at", start);
  if (end) query = query.lt("created_at", end);
  if (q) query = query.ilike("org.name", `%${q}%`);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + ADMIN_PAYMENTS_PAGE_SIZE - 1);
  if (error) throw error;
  const payments = ((data ?? []) as unknown as PaymentRow[]).map(toPayment);
  return { payments, total: count ?? payments.length };
}

/** How many payments and how much in each status for a range and search, grouped in the database
 *  (migration 0102). The tabs follow the range and the search, not the chosen tab. */
export async function getPaymentTotals(f: Pick<PaymentFilters, "range" | "query">): Promise<PaymentTotals> {
  const { from, to } = paymentRangeBounds(f.range);
  const q = likeText(f.query);
  const { data, error } = await createServerSupabase().rpc("admin_payment_totals", { p_from: from, p_to: to, p_query: q || null });
  if (error) throw error;
  const counts = Object.fromEntries(PAYMENT_TABS.map((t) => [t.key, 0])) as Record<PaymentTab, number>;
  const amounts: Record<PaymentStatus, number> = { paid: 0, failed: 0, refunded: 0, created: 0 };
  for (const r of (data ?? []) as { status: PaymentStatus; payments: number | string; total_minor: number | string }[]) {
    if (!(r.status in amounts)) continue;
    counts[r.status] = Number(r.payments);
    counts.all += Number(r.payments);
    amounts[r.status] = Number(r.total_minor);
  }
  return { counts, amounts };
}

/** The ledger for the filters: the page and the totals, read together. */
export async function listAdminPaymentsPage(f: PaymentFilters): Promise<AdminPaymentsPage> {
  const [page, totals] = await Promise.all([listPayments(f), getPaymentTotals(f)]);
  return { ...page, totals };
}

type SubRow = {
  org_id: string;
  status: AttentionPlan["status"];
  current_period_end: string | null;
  payment_due_since: string | null;
  org: { name: string } | null;
  price: { amount_minor: number | string; product: { name: string } | null } | null;
};

/** Plans that need a person (D588): a payment due, then plans ending (cancelled) within `days`,
 *  soonest first. Plans that simply renew need nothing and are only counted (countRenewingWithin). */
export async function listPlansNeedingAttention(days = 7): Promise<AttentionPlan[]> {
  const until = new Date(Date.now() + days * 86_400_000).toISOString();
  const { data, error } = await createServerSupabase()
    .from("billing_subscriptions")
    .select("org_id, status, current_period_end, payment_due_since, org:organizations(name), price:billing_prices!billing_subscriptions_price_id_fkey(amount_minor, product:billing_products(name))")
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
    amountMinor: r.price ? Number(r.price.amount_minor) : null,
    paymentDueSince: r.payment_due_since,
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
