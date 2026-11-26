import type { AttentionItem } from "@/lib/admin/models-list";
import type { BillingSettings, CatalogPrice, CatalogProduct, PriceHealth } from "@/lib/billing/catalog";
import { costMinor, formatRupees, periodCredits, realMarginPct } from "@/lib/billing/pricing";
import { refusalWords, renewalWindow, type MoveRefusal, type PriceMove } from "@/lib/billing/plan-move-copy";

// Admin › Plans and prices, cards with health (D592): what each offer earns, who is on it and what
// it brings in. Client-safe and pure; the page reads the catalog, the settings and the health once.

export type OfferView = {
  product: CatalogProduct;
  /** The price owners can buy now: the newest shown one. */
  price: CatalogPrice | null;
  plan: boolean;
  margin: number | null;
  low: boolean;
  /** What the credits cost us at today's rate, in paise. */
  costMinor: number | null;
  /** Plans running on any of its prices: active, ending or payment due. */
  agencies: number;
  ending: number;
  due: number;
  /** What the active plans pay each month, before GST. */
  monthlyMinor: number;
  /** Bought this month, and the sum with GST. */
  paidCount: number;
  paidMinor: number;
  /** Agencies on an older price of this offer, newest price first, and how their move to today's
   *  price stands (D593). */
  older: OlderPrice[];
};

export type OlderPrice = {
  amountMinor: number;
  agencies: number;
  /** Set up to pay today's price from their next renewal, between these dates. */
  moving: number;
  firstRenewal: string | null;
  lastRenewal: string | null;
  /** Marked to move, not set up yet (a payment due, or not reached yet). */
  waiting: number;
  /** Can't move, by why, with the agencies. UPI and bank mandate owners are asked to approve
   *  today's price, and their plans end between `firstEnd` and `lastEnd` if they don't (D595). */
  refused: { refused: MoveRefusal; agencies: number; orgs: { id: string; name: string }[]; firstEnd: string | null; lastEnd: string | null }[];
  /** Today's price, which the refused owners are asked to approve. */
  toMinor: number | null;
};

const NONE: PriceHealth = { agencies: 0, active: 0, ending: 0, due: 0, monthlyMinor: 0, paidCount: 0, paidMinor: 0 };

export function currentPrice(product: CatalogProduct): CatalogPrice | null {
  return product.prices.find((p) => p.active) ?? null;
}

const earliest = (a: string | null, b: string | null) => (a === null ? b : b === null ? a : a < b ? a : b);
const latest = (a: string | null, b: string | null) => (a === null ? b : b === null ? a : a > b ? a : b);

/** An older price's agencies and their moves to today's price. */
function olderPrice(p: CatalogPrice, agencies: number, to: CatalogPrice | null, moves: readonly PriceMove[]): OlderPrice {
  const o: OlderPrice = { amountMinor: p.amount_minor, agencies, moving: 0, firstRenewal: null, lastRenewal: null, waiting: 0, refused: [], toMinor: to?.amount_minor ?? null };
  for (const m of moves) {
    if (m.priceId !== p.id || !to || m.nextPriceId !== to.id) continue;
    if (m.state === "scheduled") {
      o.moving += m.agencies;
      o.firstRenewal = earliest(o.firstRenewal, m.firstRenewal);
      o.lastRenewal = latest(o.lastRenewal, m.lastRenewal);
    } else if (m.state === "waiting") o.waiting += m.agencies;
    else if (m.refused) o.refused.push({ refused: m.refused, agencies: m.agencies, orgs: m.orgs, firstEnd: m.firstEnd ?? null, lastEnd: m.lastEnd ?? null });
  }
  return o;
}

export function offerView(product: CatalogProduct, health: Record<string, PriceHealth>, settings: BillingSettings | null, moves: readonly PriceMove[] = []): OfferView {
  const price = currentPrice(product);
  const of = (p: CatalogPrice) => health[p.id] ?? NONE;
  const sum = (key: keyof PriceHealth) => product.prices.reduce((n, p) => n + of(p)[key], 0);
  const margin = price && settings ? realMarginPct(price, settings.inrPerUsd) : null;
  return {
    product,
    price,
    plan: product.kind === "plan",
    margin,
    low: margin !== null && settings !== null && margin < settings.minMarginPct,
    costMinor: price && settings ? Math.round(costMinor(periodCredits(price), settings.inrPerUsd)) : null,
    agencies: sum("agencies"),
    ending: sum("ending"),
    due: sum("due"),
    monthlyMinor: sum("monthlyMinor"),
    paidCount: sum("paidCount"),
    paidMinor: sum("paidMinor"),
    older: product.prices.filter((p) => p !== price && of(p).agencies > 0).map((p) => olderPrice(p, of(p).agencies, price, moves)),
  };
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/** Shown first, hidden last, each in catalog order. */
export function sortOffers(views: OfferView[]): OfferView[] {
  return [...views].sort((a, b) => Number(!a.product.active) - Number(!b.product.active));
}

/** The line under a section's title. */
export function sectionSummary(views: OfferView[], kind: "plan" | "topup"): string {
  if (kind === "plan") {
    const on = views.reduce((n, v) => n + v.agencies - v.ending, 0);
    const monthly = views.reduce((n, v) => n + v.monthlyMinor, 0);
    return `${plural(on, "agency", "agencies")} on a plan · ${formatRupees(monthly)} a month before GST`;
  }
  const bought = views.reduce((n, v) => n + v.paidCount, 0);
  const paid = views.reduce((n, v) => n + v.paidMinor, 0);
  return `${plural(bought, "top-up", "top-ups")} this month · ${formatRupees(paid)} with GST`;
}

/** "2 agencies, 1 ending, 1 payment due". */
export function agenciesLine(v: OfferView): { main: string; extra: string } {
  const extra = [v.ending ? `${v.ending} ending` : "", v.due ? `${v.due} payment due` : ""].filter(Boolean).join(", ");
  return { main: plural(v.agencies, "agency", "agencies"), extra };
}

const they = (n: number) => (n === 1 ? "it" : "they");
const theyStay = (n: number) => (n === 1 ? "it stays" : "they stay");
const theirRenewal = (n: number) => (n === 1 ? "its next renewal" : "their next renewal");

/** What one refused group of an older price says: asked to approve (UPI, bank mandate, D595), or
 *  stays on the old price. */
function refusedText(r: OlderPrice["refused"][number], o: OlderPrice, untilChange = true): string {
  const old = `${formatRupees(o.amountMinor)} + GST`;
  const changes = `${they(r.agencies)} change${r.agencies === 1 ? "s" : ""} plan`;
  if (r.refused === "other") return `${plural(r.agencies, "agency", "agencies")} couldn't be moved, so ${theyStay(r.agencies)} on ${old} until ${changes}`;
  if (r.firstEnd && o.toMinor !== null) {
    const ends = r.agencies === 1 ? "plan ends" : "plans end";
    return `${plural(r.agencies, "agency", "agencies")} ${refusalWords(r.refused, r.agencies)}: asked to approve ${formatRupees(o.toMinor)} + GST, ${ends} ${renewalWindow(r.firstEnd, r.lastEnd)} if ${they(r.agencies)} ${r.agencies === 1 ? "doesn't" : "don't"}`;
  }
  return `${plural(r.agencies, "agency", "agencies")} ${refusalWords(r.refused, r.agencies)}, so ${theyStay(r.agencies)} on ${old}${untilChange ? ` until ${changes}` : ""}`;
}

/** Agencies on an older price move to today's price from their next renewal, once that is set up on
 *  the payment service (D593). One line per older price: who moves and when, who isn't set up yet,
 *  who can't move (and so stays) and who is ending or changing to another plan. */
export function olderPriceLines(v: OfferView): string[] {
  return v.older.map((o) => {
    const old = `${formatRupees(o.amountMinor)} + GST`;
    const refused = o.refused.reduce((n, r) => n + r.agencies, 0);
    const others = Math.max(0, o.agencies - o.moving - o.waiting - refused);
    const bits: string[] = [];
    if (o.moving) bits.push(`${plural(o.moving, "agency moves", "agencies move")} from ${old} to the new price at ${theirRenewal(o.moving)}, ${renewalWindow(o.firstRenewal, o.lastRenewal)}.`);
    if (o.waiting) bits.push(`${plural(o.waiting, "agency", "agencies")} on ${old} ${o.waiting === 1 ? "isn't" : "aren't"} set up to move yet. ${o.waiting === 1 ? "It's" : "They're"} tried again each night.`);
    for (const r of o.refused) bits.push(`${refusedText(r, o)}.`);
    if (others) bits.push(`${plural(others, "agency", "agencies")} on ${old} ${others === 1 ? "is" : "are"} ending or changing to another plan.`);
    return bits.join(" ");
  });
}

/** Agencies that can't move to today's price, for Needs a look. Its action opens the one agency, or
 *  the offer when there are several. */
export function moveRefusedItems(views: OfferView[]): AttentionItem[] {
  return views.flatMap((v) =>
    v.older.flatMap((o) =>
      o.refused.map((r) => ({
        key: `move-${v.product.id}-${o.amountMinor}-${r.refused}`,
        modelId: null,
        tone: "warn" as const,
        name: v.product.name,
        text:
          r.refused === "other"
            ? `${plural(r.agencies, "agency", "agencies")} couldn't be moved to the new price, so ${theyStay(r.agencies)} on ${formatRupees(o.amountMinor)} + GST`
            : refusedText(r, o, false),
        detail: `${r.orgs.map((g) => g.name).join(", ")}.`,
        action: r.orgs.length === 1 ? "Open the agency" : "See the plan",
        href: r.orgs.length === 1 ? `/admin/orgs/${r.orgs[0].id}` : `#offer-${v.product.id}`,
      })),
    ),
  );
}

/** Shown offers that earn less than the minimum, for Needs a look. Its action edits the price. */
export function lowMarginItems(views: OfferView[], settings: BillingSettings | null): AttentionItem[] {
  if (!settings) return [];
  return views
    .filter((v) => v.product.active && v.low)
    .map((v) => ({
      key: `low-${v.product.id}`,
      modelId: null,
      tone: "warn" as const,
      name: v.product.name,
      text: `earns ${v.margin}% at ₹${settings.inrPerUsd.toLocaleString("en-IN")} a dollar, below ${settings.minMarginPct}%`,
      detail: v.plan ? `${plural(v.agencies, "agency is", "agencies are")} on it.` : "",
      action: "Change the price",
      href: `#offer-${v.product.id}`,
    }));
}
