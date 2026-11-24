// The change-prices flow on the admin model page (prototype v3, "Change prices flow"): typed cells
// turned into price lines, and the review's diff, replace list, warnings, typical run and agencies.
// When a change starts is in change-prices-when.ts, the toast and Undo in change-prices-undo.ts.
// Amounts a person reads and types are per 1M for tokens; lines store the unit price. Client-safe.
import { lineFor } from "@/lib/ai-models/pricing";
import { displayAmount, isTokenMeter, storedDecimal } from "@/lib/ai-models/price-format";
import type { AiModel, AiModelPrice, CreditSettings, Meter, PriceLine } from "@/lib/ai-models/types";
import { lineKey, meterLabel, priceGrid, whenText, type GridCell, type OtherCharge } from "./price-grid";
import { isBigChange, parsePriceEntry, percentChange } from "./percent-edit";
import { runCredits, runSpec, specLabel } from "./typical-runs";
import { formatIstDate, formatIstWhen, relativeIstDay } from "./ist";
import { beforePrice, pricesByStart, replacedRow, whenInstant, type When } from "./change-prices-when";
import { confirmLabel } from "./change-prices-words";
import { keepsNote } from "./change-prices-undo";

type FlowModel = Pick<AiModel, "id" | "kind" | "params" | "providerLabel">;
type Settings = Pick<CreditSettings, "marginPercent" | "roundStep">;
/** What the admin typed, by line key. A key that isn't here is untouched. */
export type EditValues = Readonly<Record<string, string>>;

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The text a cell starts with: the stored price at full precision (per 1M for tokens), blank with none. */
export function editText(meter: Meter, usd: number | null): string {
  return usd === null ? "" : storedDecimal(displayAmount(meter, usd));
}

/** A typed amount as the unit price a line stores. */
function unitUsd(meter: Meter, amount: number): number {
  return isTokenMeter(meter) ? Number((amount / 1e6).toPrecision(12)) : amount;
}

/** Two prices the same to float noise: a typed "0.10" is the stored 0.1. */
export function samePrice(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));
}

export type EditCell = GridCell & { name: string };
export type EditCharge = OtherCharge & { name: string };

/** The cells the grid edits (offered ones) and the other charges, each with its name for people. */
export function editTargets(model: FlowModel, base: AiModelPrice): { cells: (EditCell & { amount: number | null })[]; otherCharges: EditCharge[] } {
  const g = priceGrid(model, base);
  return {
    cells: g.cells.flat().filter((c) => c.offered).map((c) => ({ ...c, amount: c.usd, name: cellName(model, c) })),
    otherCharges: g.otherCharges.map((o) => ({ ...o, name: o.label })),
  };
}

/** "720p, per second of video", "Square, High, per image". */
function cellName(model: FlowModel, c: Pick<GridCell, "meter" | "when">): string {
  return `${capitalise(whenText(c.when) || "All settings")}, ${meterLabel(c.meter, model)}`;
}

export type CellState =
  | { kind: "unchanged" }
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "new"; usd: number; approximate: boolean }
  | { kind: "changed"; usd: number; oldUsd: number; percent: number | null; big: boolean; approximate: boolean };

/** What a cell's text means against its old price. A blank cell keeps the old price. */
export function cellState(meter: Meter, oldUsd: number | null, typed: string | undefined, approximate: boolean): CellState {
  if (typed === undefined || typed.trim() === "") return oldUsd === null ? { kind: "empty" } : { kind: "unchanged" };
  // The text the cell started with is the stored price, even where the store has more digits than it shows.
  if (oldUsd !== null && typed.trim() === editText(meter, oldUsd)) return { kind: "unchanged" };
  const entry = parsePriceEntry(typed, oldUsd === null ? null : displayAmount(meter, oldUsd));
  if (entry.kind !== "price") return { kind: "invalid" };
  const usd = unitUsd(meter, entry.value);
  const approx = approximate || entry.approximate;
  if (oldUsd === null) return { kind: "new", usd, approximate: approx };
  if (samePrice(usd, oldUsd)) return { kind: "unchanged" };
  return { kind: "changed", usd, oldUsd, percent: percentChange(oldUsd, usd), big: isBigChange(oldUsd, usd), approximate: approx };
}

const keyOf = (l: PriceLine) => lineKey(l.meter, l.when);
const copyLine = (l: PriceLine): PriceLine => (l.when ? { ...l, when: { ...l.when } } : { ...l });

/**
 * The new price lines: the base row's lines with only the edited prices changed. A cell's line is
 * the one a run at that setting matches (lineFor). When that line is the cell's own, its price
 * changes in place; when it is a broader line (or none), the cell gets its own line just before it,
 * so runs at that setting match it and every other setting keeps its price (an own line already
 * behind the broader one moves there). Every other line, and the order, stays as it was.
 */
export function applyEdits(model: FlowModel, base: AiModelPrice, values: EditValues): PriceLine[] {
  const t = editTargets(model, base);
  const lines = base.lines.map(copyLine);
  for (const cell of t.cells) {
    const s = cellState(cell.meter, cell.usd, values[cell.key], false);
    if (s.kind !== "new" && s.kind !== "changed") continue;
    const match = lineFor({ ...base, lines }, cell.meter, cell.when);
    const at = match ? lines.indexOf(match) : -1;
    if (match && keyOf(match) === cell.key) {
      lines[at] = { ...match, unit_usd: s.usd };
      continue;
    }
    // The cell's own line may already exist behind the broader one: it takes the price and moves
    // ahead of it, rather than a second line with the same key being added.
    const shadowed = lines.findIndex((l) => keyOf(l) === cell.key);
    const own: PriceLine =
      shadowed >= 0
        ? { ...lines.splice(shadowed, 1)[0], unit_usd: s.usd }
        : Object.keys(cell.when).length
          ? { meter: cell.meter, unit_usd: s.usd, when: { ...cell.when } }
          : { meter: cell.meter, unit_usd: s.usd };
    if (at >= 0) lines.splice(at, 0, own);
    else lines.push(own);
  }
  for (const charge of t.otherCharges) {
    if (charge.atCost) continue;
    const s = cellState(charge.meter, charge.usd, values[charge.key], false);
    if (s.kind !== "new" && s.kind !== "changed") continue;
    const at = lines.findIndex((l) => keyOf(l) === charge.key);
    if (at >= 0) lines[at] = { ...lines[at], unit_usd: s.usd };
  }
  return lines;
}

/**
 * Whether the flow has anything to edit from `base`: an image or video model always has its grid; any
 * other kind edits the lines of the row it starts from, so with no price there is nothing to type into.
 */
export function hasEditablePrices(model: FlowModel, base: AiModelPrice): boolean {
  const t = editTargets(model, base);
  return t.cells.length > 0 || t.otherCharges.some((o) => !o.atCost);
}

/** The edited cells whose text isn't a price. */
export function invalidKeys(model: FlowModel, base: AiModelPrice, values: EditValues): string[] {
  const t = editTargets(model, base);
  const all = [...t.cells, ...t.otherCharges.filter((o) => !o.atCost)];
  return all.filter((x) => values[x.key] !== undefined && cellState(x.meter, x.usd, values[x.key], false).kind === "invalid").map((x) => x.key);
}

export type PriceChange = {
  key: string;
  name: string;
  /** What a person reads (per 1M for tokens); null when there was no price. */
  oldAmount: number | null;
  /** Null when the price is removed. */
  newAmount: number | null;
  percent: number | null;
  big: boolean;
  same: boolean;
};

function change(key: string, name: string, meter: Meter, oldUsd: number | null, newUsd: number | null): PriceChange {
  return {
    key,
    name,
    oldAmount: oldUsd === null ? null : displayAmount(meter, oldUsd),
    newAmount: newUsd === null ? null : displayAmount(meter, newUsd),
    percent: percentChange(oldUsd, newUsd),
    big: isBigChange(oldUsd, newUsd),
    same: oldUsd !== null && newUsd !== null && samePrice(oldUsd, newUsd),
  };
}

const exact = (price: Pick<AiModelPrice, "lines">, key: string) => price.lines.find((l) => keyOf(l) === key)?.unit_usd ?? null;
const cellUsd = (price: AiModelPrice, c: Pick<GridCell, "meter" | "when">) => lineFor(price, c.meter, c.when)?.unit_usd ?? null;

/** Each price that differs between two rows, by what a run at each setting pays: changed, new, removed. */
export function priceChanges(model: FlowModel, before: AiModelPrice | null, after: AiModelPrice): PriceChange[] {
  const t = editTargets(model, after);
  const out: PriceChange[] = [];
  for (const c of t.cells) {
    if (c.usd === null) continue;
    const old = before ? cellUsd(before, c) : null;
    if (old === null || !samePrice(old, c.usd)) out.push(change(c.key, c.name, c.meter, old, c.usd));
  }
  for (const o of t.otherCharges) {
    if (o.atCost) continue;
    const old = before ? exact(before, o.key) : null;
    if (old === null || !samePrice(old, o.usd)) out.push(change(o.key, o.name, o.meter, old, o.usd));
  }
  if (before) {
    const b = editTargets(model, before);
    for (const c of b.cells) if (c.usd !== null && cellUsd(after, c) === null) out.push(change(c.key, c.name, c.meter, c.usd, null));
    for (const o of b.otherCharges) if (!o.atCost && exact(after, o.key) === null) out.push(change(o.key, o.name, o.meter, o.usd, null));
  }
  return out;
}

/** Every price a replaced change held, with what is saved instead (null when it goes). */
export function replacedList(model: FlowModel, replaced: AiModelPrice, newLines: PriceLine[]): PriceChange[] {
  const t = editTargets(model, replaced);
  const next = { ...replaced, lines: newLines };
  return [
    ...t.cells.filter((c) => c.usd !== null).map((c) => change(c.key, c.name, c.meter, c.usd, cellUsd(next, c))),
    ...t.otherCharges.filter((o) => !o.atCost).map((o) => change(o.key, o.name, o.meter, o.usd, exact(next, o.key))),
  ];
}

export type ReviewWarning = { tone: "info" | "warn"; text: string; same?: boolean };

/** The notes under the review: nothing new to save, a later change still following, big changes, free prices. */
export function reviewWarnings(
  model: FlowModel,
  prices: readonly AiModelPrice[],
  before: AiModelPrice | null,
  after: AiModelPrice,
  w: When,
  now: Date,
): ReviewWarning[] {
  const out: ReviewWarning[] = [];
  const at = (whenInstant(w, now) ?? now).getTime();
  const rep = replacedRow(prices, w, now);
  if (rep && priceChanges(model, rep, after).length === 0) {
    out.push({ tone: "info", text: `These are the same prices already scheduled for ${formatIstWhen(new Date(rep.effectiveFrom))}. Nothing new would be saved.`, same: true });
  }
  for (const p of pricesByStart(prices)) {
    if (p.id !== rep?.id && Date.parse(p.effectiveFrom) > at) {
      out.push({ tone: "info", text: `The change scheduled for ${formatIstWhen(new Date(p.effectiveFrom))} still follows and replaces these prices then.` });
    }
  }
  for (const c of priceChanges(model, before, after)) {
    if (c.big && c.percent !== null) {
      out.push({ tone: "warn", text: `${c.name} changes by ${c.percent > 0 ? "+" : "−"}${Math.abs(Math.round(c.percent))}%. Check it isn't a typo.` });
    }
  }
  const t = editTargets(model, after);
  const names = new Map([...t.cells, ...t.otherCharges].map((x) => [x.key, x.name]));
  for (const l of after.lines) {
    if (l.unit_usd !== 0 || l.meter === "input_image") continue;
    const name = names.get(keyOf(l)) ?? capitalise(`${meterLabel(l.meter, model)}${l.when && Object.keys(l.when).length ? ` at ${whenText(l.when as Record<string, string | boolean>)}` : ""}`);
    out.push({ tone: "warn", text: `${name} would be free.` });
  }
  return out;
}

export type TypicalChange = { label: string; before: number | null; after: number | null };

/** The model's typical run, in credits at the live settings, on the old and the new prices. */
export function typicalBeforeAfter(model: FlowModel, before: AiModelPrice | null, after: AiModelPrice, settings: Settings): TypicalChange | null {
  const spec = runSpec(model, after);
  if (!spec) return null;
  return {
    label: specLabel(model, after, spec),
    before: before ? runCredits(model, before, spec, settings) : null,
    after: runCredits(model, after, spec, settings),
  };
}

export type AgencyChange = { name: string; runs: number; before: number | null; after: number | null; percent: number | null };

/** Each agency's runs this month at the typical run, before and after; busiest first. */
export function agenciesAffected(rows: readonly { orgName: string; runs: number }[], t: Pick<TypicalChange, "before" | "after"> | null): AgencyChange[] {
  return [...rows]
    .sort((a, b) => b.runs - a.runs)
    .map((r) => {
      const before = t?.before == null ? null : r.runs * t.before;
      const after = t?.after == null ? null : r.runs * t.after;
      return { name: r.orgName, runs: r.runs, before, after, percent: percentChange(before, after) };
    });
}

export type Review = {
  /** "8 changes, from 3 Dec 2026, 20:00 IST, in 9 days.", and its two parts. */
  summary: string;
  countText: string;
  startText: string;
  /** The scheduled change this save replaces, every price in it with what is saved instead. */
  replaced: { at: Date; title: string; detail: string; rows: PriceChange[] } | null;
  /** Shown above the diff when nothing is replaced. */
  compareText: string | null;
  beforeLabel: string;
  changes: PriceChange[];
  typical: TypicalChange | null;
  warnings: ReviewWarning[];
  agencies: AgencyChange[];
  canSave: boolean;
  confirm: string;
};

/** Everything the Review step shows, for new prices `after` made from `base`, starting at `when`. */
export function buildReview(a: {
  model: FlowModel;
  label: string;
  prices: readonly AiModelPrice[];
  base: AiModelPrice;
  after: AiModelPrice;
  when: When;
  now: Date;
  settings: Settings;
  agencies: readonly { orgName: string; runs: number }[];
}): Review {
  const at = whenInstant(a.when, a.now) ?? a.now;
  const rep = replacedRow(a.prices, a.when, a.now);
  const before = beforePrice(a.prices, a.when, a.now);
  const changes = priceChanges(a.model, before, a.after);
  const warnings = reviewWarnings(a.model, a.prices, before, a.after, a.when, a.now);
  const typical = typicalBeforeAfter(a.model, before, a.after, a.settings);
  const same = warnings.some((w) => w.same);
  const count = changes.length;
  const start = a.when.mode === "now" ? "starting now." : `from ${formatIstWhen(at)}, ${relativeIstDay(at, a.now)}.`;
  const repAt = rep ? new Date(rep.effectiveFrom) : null;
  const note = rep?.note ? ` Its note, "${rep.note.replace(/\.$/, "")}", ${keepsNote(rep, a.base) ? "stays" : "is replaced too"}.` : "";
  const countText = count === 1 ? "1 change" : `${count} changes`;
  return {
    summary: `${countText}, ${start}`,
    countText,
    startText: start,
    replaced:
      rep && repAt
        ? {
            at: repAt,
            title: `This replaces the change scheduled for ${formatIstWhen(repAt)}.`,
            detail: `Every price in it is listed with what you're saving instead.${note}`,
            rows: replacedList(a.model, rep, a.after.lines),
          }
        : null,
    compareText: rep
      ? null
      : a.when.mode === "now"
        ? "Compared with today's prices."
        : `Compared with the prices that would be live on ${formatIstDate(at, false)} without this change.`,
    beforeLabel: rep ? "Scheduled" : a.when.mode === "now" ? "Now" : "Before",
    changes,
    typical,
    warnings,
    agencies: agenciesAffected(a.agencies, typical),
    canSave: !same && count > 0,
    confirm: confirmLabel({ same, replaced: repAt, mode: a.when.mode, at }),
  };
}
