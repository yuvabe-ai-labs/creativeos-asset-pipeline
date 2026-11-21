import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrgById } from "@/lib/db/organizations";
import { getCatalog } from "@/lib/db/billing-catalog";
import { getLiveSubscription, type LiveSubscription } from "@/lib/db/billing-subscriptions";
import { listOpenGrants } from "@/lib/db/credit-grants";
import type { OpenGrant } from "@/lib/billing/grants";
import type { BillingMode } from "@/lib/billing/grants";

// What the owner's billing screens need (spec 2026-11-21-owner-billing-design.md, D523), read in
// one parallel batch: five queries whatever the number of grants or payments.

export type OwnerPayment = {
  id: string;
  kind: "test" | "plan" | "renewal" | "topup";
  status: "created" | "paid" | "failed" | "refunded";
  amountMinor: number;
  taxMinor: number;
  totalMinor: number | null;
  credits: number;
  paidAt: string | null;
  createdAt: string;
  name: string | null;
};

export type OfferPrice = { priceId: string; productId: string; name: string; description: string | null; amountMinor: number; credits: number };

export type OwnerBilling = {
  mode: BillingMode;
  subscription: LiveSubscription | null;
  grants: OpenGrant[];
  payments: OwnerPayment[];
  plans: OfferPrice[];
  packs: OfferPrice[];
};

type PaymentRow = {
  id: string;
  kind: OwnerPayment["kind"];
  status: OwnerPayment["status"];
  amount_paise: number | string;
  tax_minor: number | string;
  total_minor: number | string | null;
  credits: number;
  paid_at: string | null;
  created_at: string;
  price: { product: { name: string } | null } | null;
};

/** The agency's paid and failed payments, newest first (started-but-unpaid ones are left out). */
export async function listOwnerPayments(orgId: string, limit = 24): Promise<OwnerPayment[]> {
  const { data, error } = await createServerSupabase()
    .from("billing_payments")
    .select("id, kind, status, amount_paise, tax_minor, total_minor, credits, paid_at, created_at, price:billing_prices(product:billing_products(name))")
    .eq("org_id", orgId)
    .neq("status", "created")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as PaymentRow[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    amountMinor: Number(r.amount_paise),
    taxMinor: Number(r.tax_minor),
    totalMinor: r.total_minor === null ? null : Number(r.total_minor),
    credits: r.credits,
    paidAt: r.paid_at,
    createdAt: r.created_at,
    name: r.price?.product?.name ?? null,
  }));
}

/** Plans (monthly) and packs an agency can buy now: shown, standard or its own custom one. */
export function offersFor(catalog: Awaited<ReturnType<typeof getCatalog>>, orgId: string): { plans: OfferPrice[]; packs: OfferPrice[] } {
  const visible = catalog.filter((p) => p.active);
  const pick = (kind: "plan" | "topup", interval: number | null): OfferPrice[] =>
    visible
      .filter((p) => p.kind === kind)
      .flatMap((p) => {
        const price = p.prices.find((pr) => pr.active && pr.interval_months === interval);
        return price ? [{ priceId: price.id, productId: p.id, name: p.name, description: p.description, amountMinor: price.amount_minor, credits: price.credits }] : [];
      });
  void orgId; // Custom plans (org_id) are left out of getCatalog until they have a screen (D518).
  return { plans: pick("plan", 1), packs: pick("topup", null) };
}

/** Everything the owner's billing page shows. Null when the agency doesn't exist. */
export async function getOwnerBilling(orgId: string): Promise<OwnerBilling | null> {
  const [org, subscription, grants, payments, catalog] = await Promise.all([
    getOrgById(orgId),
    getLiveSubscription(orgId),
    listOpenGrants(orgId),
    listOwnerPayments(orgId),
    getCatalog(),
  ]);
  if (!org) return null;
  return { mode: org.billing_mode, subscription, grants, payments, ...offersFor(catalog, orgId) };
}
