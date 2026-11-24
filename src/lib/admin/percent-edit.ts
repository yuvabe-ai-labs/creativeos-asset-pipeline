// Percent edits on the change-prices grid: "−31%" in a cell, or "change every price by". Amounts here
// are what the admin reads and types (token prices per 1M). Client-safe.

/** A typed percent: "−31%", "-31", "–31 %", "+20". Null when it isn't one. */
export function parsePercent(typed: string): number | null {
  const s = typed.trim().replace(/[−–]/g, "-").replace(/[\s%]/g, "");
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : null;
}

/** A percent result is rounded to 4 significant figures, so it is marked approximate. */
export function applyPercent(amount: number, percent: number): { value: number; approximate: true } {
  return { value: Number((amount * (1 + percent / 100)).toPrecision(4)), approximate: true };
}

export type PriceEntry = { kind: "empty" } | { kind: "invalid" } | { kind: "price"; value: number; approximate: boolean };

/** What a cell's text means: a price ("0.07", "$1,000"), a percent of the old amount ("−31%"), blank, or neither. */
export function parsePriceEntry(typed: string, oldAmount: number | null): PriceEntry {
  const s = typed.trim().replace(/[−–]/g, "-").replace(/[$,\s]/g, "");
  if (s === "") return { kind: "empty" };
  if (s.endsWith("%")) {
    const p = parsePercent(s);
    if (p === null || oldAmount === null) return { kind: "invalid" };
    return { kind: "price", ...applyPercent(oldAmount, p) };
  }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return { kind: "invalid" };
  return { kind: "price", value: Number(s), approximate: false };
}

export function percentChange(oldValue: number | null, newValue: number | null): number | null {
  if (oldValue === null || newValue === null || oldValue === 0) return null;
  return ((newValue - oldValue) / oldValue) * 100;
}

/** A change of 50% or more either way is flagged, in case it is a typo. */
export const BIG_CHANGE_PERCENT = 50;

export function isBigChange(oldValue: number | null, newValue: number | null): boolean {
  const p = percentChange(oldValue, newValue);
  // Float noise: 0.1 to 0.05 works out as -49.999999999999993%.
  return p !== null && Math.abs(p) >= BIG_CHANGE_PERCENT - 1e-9;
}

/** The change chip: "−31%", "+4.6%". Null when there is no change to show. */
export function percentChipText(p: number | null): string | null {
  if (p === null || Math.abs(p) < 0.05) return null;
  const shown = Math.abs(p) >= 10 ? Math.round(Math.abs(p)) : Number(Math.abs(p).toFixed(1));
  return `${p < 0 ? "−" : "+"}${shown}%`;
}

export type BulkTarget = { key: string; amount: number | null };

/**
 * "Change every price by": sets each priced cell (and, when asked, each other charge that isn't at
 * cost) to its base amount changed by `percent`. A cell the admin typed by hand is left alone; a
 * cell an earlier percent set is set again from its base. Returns new values; the inputs are untouched.
 */
export function bulkApplyPercent(a: {
  cells: readonly BulkTarget[];
  otherCharges: readonly (BulkTarget & { atCost: boolean })[];
  values: Readonly<Record<string, string>>;
  percentKeys: readonly string[];
  percent: number;
  includeOtherCharges: boolean;
}): { values: Record<string, string>; percentKeys: string[]; changed: number; kept: number } {
  const values = { ...a.values };
  const percentKeys = [...a.percentKeys];
  const targets = [...a.cells, ...(a.includeOtherCharges ? a.otherCharges.filter((o) => !o.atCost) : [])];
  let changed = 0;
  let kept = 0;
  for (const t of targets) {
    if (t.amount === null) continue;
    if (values[t.key] !== undefined && !percentKeys.includes(t.key)) {
      kept++;
      continue;
    }
    values[t.key] = String(applyPercent(t.amount, a.percent).value);
    if (!percentKeys.includes(t.key)) percentKeys.push(t.key);
    changed++;
  }
  return { values, percentKeys, changed, kept };
}
