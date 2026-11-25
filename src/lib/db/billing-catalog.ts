import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { CatalogPrice, CatalogProduct, BillingSettings } from "@/lib/billing/catalog";

// The plans, packs, prices and pricing settings (migrations 0092, 0093). Reads are three calls
// whatever the number of agencies; writes go through the 0093 functions, which log each change.

const PRICE_COLUMNS = "id, amount_minor, list_amount_minor, interval_months, credits, credits_every_months, valid_days, active, created_at";

type PriceRow = Omit<CatalogPrice, "amount_minor" | "list_amount_minor" | "credits"> & {
  amount_minor: number | string;
  list_amount_minor: number | string | null;
  credits: number | string;
};
type ProductRow = Omit<CatalogProduct, "prices"> & { billing_prices: PriceRow[] | null };

const toPrice = (p: PriceRow): CatalogPrice => ({
  ...p,
  amount_minor: Number(p.amount_minor),
  list_amount_minor: p.list_amount_minor === null ? null : Number(p.list_amount_minor),
  credits: Number(p.credits),
});

/** Every product (standard ones; custom plans for one agency are left out until they have a
 *  screen) with all its prices, newest price first. One query. */
export async function getCatalog(): Promise<CatalogProduct[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("billing_products")
    .select(`id, kind, name, description, sort, active, billing_prices(${PRICE_COLUMNS})`)
    .is("org_id", null)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ProductRow[]).map(({ billing_prices, ...product }) => ({
    ...product,
    prices: (billing_prices ?? []).map(toPrice).sort((a, b) => b.created_at.localeCompare(a.created_at)),
  }));
}

type SettingsRow = {
  id: string;
  inr_per_usd: number | string;
  plan_margin_pct: number | string;
  topup_margin_pct: number | string;
  min_margin_pct: number | string;
  effective_from: string;
  note: string | null;
};

/** The pricing settings in force: the latest row that has started. */
export async function getBillingSettings(): Promise<BillingSettings | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("billing_settings")
    .select("id, inr_per_usd, plan_margin_pct, topup_margin_pct, min_margin_pct, effective_from, note")
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const r = data as SettingsRow | null;
  if (!r) return null;
  return {
    id: r.id,
    inrPerUsd: Number(r.inr_per_usd),
    planMarginPct: Number(r.plan_margin_pct),
    topupMarginPct: Number(r.topup_margin_pct),
    minMarginPct: Number(r.min_margin_pct),
    effectiveFrom: r.effective_from,
    note: r.note,
  };
}

/** Live subscriptions per price, grouped in the database. */
export async function getSubscriberCounts(): Promise<Record<string, number>> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("billing_price_subscriber_counts");
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const r of (data ?? []) as { price_id: string; subscribers: number }[]) counts[r.price_id] = Number(r.subscribers);
  return counts;
}

export async function saveBillingSettings(
  s: { inrPerUsd: number; planMarginPct: number; topupMarginPct: number; minMarginPct: number; note: string },
  actorId: string,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc("admin_save_billing_settings", {
    p_inr_per_usd: s.inrPerUsd,
    p_plan_margin_pct: s.planMarginPct,
    p_topup_margin_pct: s.topupMarginPct,
    p_min_margin_pct: s.minMarginPct,
    p_actor: actorId,
    p_note: s.note,
  });
  if (error) throw error;
}

/** Adds a product when `id` is null, else changes it. Null when the product is missing. */
export async function saveProduct(
  p: { id: string | null; kind: "plan" | "topup"; name: string; description: string | null; sort?: number; active?: boolean },
  actorId: string,
): Promise<string | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("admin_save_product", {
    p_id: p.id,
    p_kind: p.kind,
    p_name: p.name,
    p_description: p.description,
    p_sort: p.sort ?? null,
    p_active: p.active ?? null,
    p_actor: actorId,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Adds a plan or pack with its price (`productId` null), or edits it: name, description and
 *  visibility in place; a changed amount or credits becomes a new price that replaces the old one
 *  for its agencies from their next payment (admin_save_offer, migration 0094). */
export async function saveOffer(
  o: {
    productId: string | null;
    kind: "plan" | "topup";
    name: string;
    description: string | null;
    active: boolean;
    amountMinor: number;
    credits: number;
    intervalMonths: number | null;
    reason: string | null;
  },
  actorId: string,
): Promise<{ productId: string; priceChanged: boolean; moved: number }> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("admin_save_offer", {
    p_product_id: o.productId,
    p_kind: o.kind,
    p_name: o.name,
    p_description: o.description,
    p_active: o.active,
    p_amount_minor: o.amountMinor,
    p_credits: o.credits,
    p_interval_months: o.intervalMonths,
    p_actor: actorId,
    p_reason: o.reason,
  });
  if (error) throw error;
  const row = ((data ?? []) as { product_id: string; price_changed: boolean; moved_count: number }[])[0];
  if (!row) throw new Error("admin_save_offer returned no row");
  return { productId: row.product_id, priceChanged: row.price_changed, moved: Number(row.moved_count) };
}

/** The price in force for a product and interval, to tell whether an edit changes it. */
export async function getCurrentPrice(productId: string, intervalMonths: number | null): Promise<{ amountMinor: number; credits: number } | null> {
  const supabase = createServerSupabase();
  let query = supabase.from("billing_prices").select("amount_minor, credits").eq("product_id", productId).eq("active", true);
  query = intervalMonths === null ? query.is("interval_months", null) : query.eq("interval_months", intervalMonths);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  const r = data as { amount_minor: number | string; credits: number | string } | null;
  return r ? { amountMinor: Number(r.amount_minor), credits: Number(r.credits) } : null;
}
