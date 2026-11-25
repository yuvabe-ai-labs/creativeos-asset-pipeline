// The admin models list (prototype v3, "Models list"): one row per model with its price range, the
// credits for a typical run at the credit settings live now, the next scheduled price change and this
// month's runs; and the "Needs a look" items above it. The server builds it once; the list filters it
// in the browser. Client-safe.
import { currentPrice } from "@/lib/ai-models/pricing";
import { formatUsd } from "@/lib/ai-models/price-format";
import { creditSettingsAt } from "@/lib/credits/units";
import type { AiModel, AiModelPrice, CreditSettings } from "@/lib/ai-models/types";
import { lineKey, priceRange, type PriceRange } from "./price-grid";
import { runCredits, runSpec, specLabel } from "./typical-runs";
import { formatIstDate, formatIstWhen, relativeIstDay } from "./ist";
import { BIG_CHANGE_PERCENT, percentChange, percentChipText } from "./percent-edit";
import { settingsWords } from "./credits-page";

export const LIST_GROUPS = ["Video", "Image", "Text", "Audio & lip sync", "Other"] as const;
export type ListGroup = (typeof LIST_GROUPS)[number];

const KIND_GROUP: Record<string, ListGroup> = {
  video: "Video",
  image: "Image",
  edit: "Image",
  text: "Text",
  dub: "Audio & lip sync",
  voice: "Audio & lip sync",
  lipsync: "Audio & lip sync",
  transcribe: "Audio & lip sync",
  scrape: "Other",
};

export const groupOfKind = (kind: string): ListGroup => KIND_GROUP[kind] ?? "Other";

export const modelHref = (id: string) => `/admin/models/${encodeURIComponent(id)}`;
/** The model page with the change-prices flow open: "Add prices" and a scheduled change's "Review". */
export const changePricesHref = (id: string) => `${modelHref(id)}?change=1`;
export const CREDITS_HREF = "/admin/credits";

export type ModelListRow = {
  id: string;
  label: string;
  provider: string;
  group: ListGroup;
  status: string;
  /** The row fails its check (D570): shown, but with no price or run worked out. */
  broken: boolean;
  price: PriceRange | null;
  typical: { credits: number; label: string } | null;
  /** Priced, but with no typical run to work out (charged at what the provider reports). */
  atCost: boolean;
  next: { chip: string; tone: "down" | "up" | "big" | "new"; date: string } | null;
  month: { runs: number; cost: string } | null;
};

export type AttentionItem = {
  key: string;
  modelId: string | null;
  tone: "bad" | "info" | "next";
  /** Shown bold before the text; null for the credit settings item. */
  name: string | null;
  text: string;
  detail: string;
  action: string;
  href: string;
};

export type ModelsListInput = {
  models: ReadonlyArray<{ model: AiModel | null; raw: Record<string, unknown>; problems: string[] }>;
  prices: readonly AiModelPrice[];
  stats: ReadonlyArray<{ modelId: string; runs: number; costUsd: number }>;
  creditSettings: readonly CreditSettings[];
  /** Models with a price row that fails its check (left out of `prices`). */
  brokenPriceModelIds?: readonly string[];
  /** A credit settings row fails its check (left out of `creditSettings`). */
  brokenCreditSettings?: boolean;
  now: Date;
};

export type PriceDiff = {
  changed: { key: string; old: number; next: number; percent: number | null }[];
  added: number;
  removed: number;
};

/** How `next` differs from `prev`, line by line (a line is its meter and settings). */
export function priceDiff(prev: Pick<AiModelPrice, "lines">, next: Pick<AiModelPrice, "lines">): PriceDiff {
  const old = new Map(prev.lines.map((l) => [lineKey(l.meter, l.when), l.unit_usd]));
  const now = new Map(next.lines.map((l) => [lineKey(l.meter, l.when), l.unit_usd]));
  const changed: PriceDiff["changed"] = [];
  let added = 0;
  for (const [key, usd] of now) {
    const o = old.get(key);
    if (o === undefined) added++;
    else if (Math.abs(o - usd) > 1e-12) changed.push({ key, old: o, next: usd, percent: percentChange(o, usd) });
  }
  const removed = [...old.keys()].filter((k) => !now.has(k)).length;
  return { changed, added, removed };
}

/** The one percent every changed price moves by, or null when they move by different amounts. */
function uniformPercent(d: PriceDiff): number | null {
  const ps = d.changed.map((c) => c.percent);
  if (!ps.length || ps.some((p) => p === null)) return null;
  const rounded = new Set(ps.map((p) => Math.round(p as number)));
  return rounded.size === 1 ? (ps as number[]).reduce((a, b) => a + b, 0) / ps.length : null;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
const signed = (p: number) => `${p < 0 ? "−" : "+"}${Math.abs(p)}%`;

/** "prices drop 31%", "3 prices −50% to +10%, adds 1 price", "starting price". */
export function changeWords(d: PriceDiff | null): string {
  if (!d) return "starting price";
  const bits: string[] = [];
  const p = uniformPercent(d);
  if (p !== null) bits.push(`prices ${p < 0 ? "drop" : "rise"} ${Math.abs(Math.round(p))}%`);
  else if (d.changed.length) {
    const ps = d.changed.map((c) => Math.round(c.percent ?? 0));
    bits.push(`${plural(d.changed.length, "price", "prices")} ${signed(Math.min(...ps))} to ${signed(Math.max(...ps))}`);
  }
  if (d.added) bits.push(`adds ${plural(d.added, "price", "prices")}`);
  if (d.removed) bits.push(`removes ${plural(d.removed, "price", "prices")}`);
  return bits.join(", ") || "no price changes";
}

function nextChip(d: PriceDiff | null): { chip: string; tone: "down" | "up" | "big" | "new" } {
  const p = d ? uniformPercent(d) : null;
  const text = p === null ? null : percentChipText(p);
  if (p === null || text === null) return { chip: "Change", tone: "new" };
  return { chip: text, tone: Math.abs(p) >= BIG_CHANGE_PERCENT - 1e-9 ? "big" : p < 0 ? "down" : "up" };
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

const TONE_ORDER: Record<AttentionItem["tone"], number> = { bad: 0, info: 1, next: 2 };

export function buildModelsList(input: ModelsListInput): { rows: ModelListRow[]; attention: AttentionItem[]; settingsLine: string } {
  const { now } = input;
  const settings = creditSettingsAt({ creditSettings: [...input.creditSettings] }, now);
  const brokenPrices = new Set(input.brokenPriceModelIds ?? []);
  const stats = new Map(input.stats.map((s) => [s.modelId, s]));
  const pricesOf = new Map<string, AiModelPrice[]>();
  for (const p of input.prices) pricesOf.set(p.modelId, [...(pricesOf.get(p.modelId) ?? []), p]);

  const rows: ModelListRow[] = [];
  const items: AttentionItem[] = [];

  for (const { model: m, raw } of input.models) {
    const id = m?.id ?? str(raw.id) ?? "";
    const label = m?.label ?? str(raw.label) ?? id;
    const s = stats.get(id);
    const month = s && s.runs > 0 ? { runs: s.runs, cost: formatUsd(s.costUsd) } : null;
    const item = (tone: AttentionItem["tone"], text: string, detail: string, action: string) =>
      items.push({
        key: `${id}:${text}`, modelId: id, tone, name: label, text, detail, action,
        href: action === "Add prices" || action === "Review" ? changePricesHref(id) : modelHref(id),
      });

    if (!m) {
      rows.push({
        id, label, provider: str(raw.provider_label) ?? str(raw.provider) ?? "", group: groupOfKind(str(raw.kind) ?? ""),
        status: str(raw.status) ?? "draft", broken: true, price: null, typical: null, atCost: false, next: null, month,
      });
      item("bad", "fails its check", "Runs can't use it until it is fixed.", "Open");
      continue;
    }

    const own = { prices: pricesOf.get(id) ?? [] };
    const live = currentPrice(own, id, now);
    const spec = live ? runSpec(m, live) : null;
    const credits = live && spec ? runCredits(m, live, spec, settings) : null;
    const typical = live && spec && credits !== null ? { credits, label: specLabel(m, live, spec) } : null;
    const next = own.prices
      .filter((p) => new Date(p.effectiveFrom) > now)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0] ?? null;
    let nextCell: ModelListRow["next"] = null;
    if (next) {
      const at = new Date(next.effectiveFrom);
      const prev = currentPrice(own, id, new Date(at.getTime() - 1));
      const d = prev ? priceDiff(prev, next) : null;
      nextCell = { ...nextChip(d), date: formatIstDate(at, false) };
      item("next", `${changeWords(d)} on ${formatIstDate(at, false)}`, `Starts ${formatIstWhen(at)}, ${relativeIstDay(at, now)}.`, "Review");
    }
    if (!own.prices.length && brokenPrices.has(id)) item("bad", "has a price that fails its check", "Runs can't be charged until it is fixed.", "Open");
    else if (!own.prices.length) item("bad", "has no price yet", "Runs can't be charged, so it stays a draft until it has one.", "Add prices");
    else if (m.status === "draft") item("info", "is a draft", "Only super admins can pick it.", "Open");
    if (m.status === "retired" && !m.replacedBy) item("bad", "is retired with no replacement", "Nodes using it have nothing to switch to.", "Pick one");

    rows.push({
      id, label, provider: m.providerLabel, group: groupOfKind(m.kind), status: m.status, broken: false,
      price: live ? priceRange(m, live) : null,
      typical,
      atCost: !typical && live !== null,
      next: nextCell,
      month,
    });
  }

  const attention = items.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
  const upcoming = [...input.creditSettings]
    .filter((c) => new Date(c.effectiveFrom) > now)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
  if (upcoming) {
    const at = new Date(upcoming.effectiveFrom);
    attention.unshift({
      key: "credit-settings",
      modelId: null,
      tone: "next",
      name: null,
      text: `Credit settings change on ${formatIstDate(at, false)}`,
      detail: `${capitalise(settingsWords(upcoming))}, from ${formatIstWhen(at)}. Today: ${settingsWords(settings)}.`,
      action: "Review",
      href: CREDITS_HREF,
    });
  }

  if (input.brokenCreditSettings) {
    attention.unshift({
      key: "credit-settings-broken",
      modelId: null,
      tone: "bad",
      name: null,
      text: "A credit settings change fails its check",
      detail: "Runs keep the settings live now until it is fixed or cancelled.",
      action: "Review",
      href: CREDITS_HREF,
    });
  }

  return { rows, attention, settingsLine: `1 credit = $0.001, ${settingsWords(settings)}` };
}

export type ListFilter = { group: ListGroup | "all"; onlyRuns: boolean; query: string };

/** The kind tab, "Only with runs this month" and the search (name and maker). */
export function filterModelRows(rows: readonly ModelListRow[], f: ListFilter): ModelListRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (f.group === "all" || r.group === f.group) &&
      (!f.onlyRuns || r.month !== null) &&
      (!q || `${r.label} ${r.provider}`.toLowerCase().includes(q)),
  );
}

/** Rows by group in the prototype's order, with each group's live count; retired rows only when shown. */
export function groupModelRows(rows: readonly ModelListRow[], showRetired: boolean) {
  const retired = rows.filter((r) => r.status === "retired").length;
  const shown = showRetired ? rows : rows.filter((r) => r.status !== "retired");
  const groups = LIST_GROUPS.map((group) => {
    const list = shown.filter((r) => r.group === group);
    return { group, rows: list, live: list.filter((r) => r.status === "live").length };
  }).filter((g) => g.rows.length);
  return { groups, retired };
}
