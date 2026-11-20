import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { CatalogPrice, CatalogProduct, BillingSettings } from "@/lib/billing/catalog";

// The plans, packs, prices and pricing settings (migrations 0068, 0069). Reads are three calls
// whatever the number of agencies; writes go through the 0069 functions, which log each change.

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

/** Adds a price; with `replaces`, hides that price and moves its subscribers to this one from
 *  their next payment. Returns how many subscriptions moved. */
export async function addPrice(
  p: { productId: string; amountMinor: number; credits: number; intervalMonths: number | null; replaces: string | null; reason: string | null },
  actorId: string,
): Promise<{ priceId: string; moved: number }> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("admin_add_price", {
    p_product_id: p.productId,
    p_amount_minor: p.amountMinor,
    p_list_amount_minor: null,
    p_interval_months: p.intervalMonths,
    p_credits: p.credits,
    // Phase 1: a plan's credits arrive every month; a top-up has no cadence.
    p_credits_every_months: p.intervalMonths === null ? null : 1,
    p_valid_days: null,
    p_replaces: p.replaces,
    p_actor: actorId,
    p_reason: p.reason,
  });
  if (error) throw error;
  const row = ((data ?? []) as { new_price_id: string; moved_count: number }[])[0];
  if (!row) throw new Error("admin_add_price returned no row");
  return { priceId: row.new_price_id, moved: Number(row.moved_count) };
}

/** False when the price is missing or already so. */
export async function setPriceActive(priceId: string, active: boolean, actorId: string): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("admin_set_price_active", { p_price_id: priceId, p_active: active, p_actor: actorId });
  if (error) throw error;
  return data === true;
}
