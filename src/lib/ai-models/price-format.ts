// How a price line reads to a person. Client-safe; shared by the models list and price history.
import type { Meter, PriceLine } from "./types";

/** A plain decimal, never exponent form, with trailing zeros trimmed. */
export function plainDecimal(n: number): string {
  const s = n.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
  return s === "" || s === "-0" ? "0" : s;
}

export const isTokenMeter = (meter: Meter): boolean => meter.endsWith("_token");

// Stored prices carry at most 7 significant figures (every vendor price fits), so that is what is shown.
const STORED = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 7, useGrouping: false });

/** A number at its stored precision: up to 7 significant figures, trailing zeros trimmed, never exponent form. */
export function storedDecimal(n: number): string {
  const s = STORED.format(n);
  return s === "-0" ? "0" : s;
}

/**
 * The one money format for admin screens: the stored price, never rounded to a few
 * decimals. At least 2 decimals, thousands grouped, "–" for no value.
 */
export function formatUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  const a = Math.abs(n);
  const [whole, frac = ""] = storedDecimal(a).split(".");
  const grouped = a >= 1000 ? Number(whole).toLocaleString("en-US") : whole;
  const sign = n < 0 && storedDecimal(a) !== "0" ? "−" : "";
  return `${sign}$${grouped}.${frac.padEnd(2, "0")}`;
}

const CENTS = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;

/**
 * Money rounded for reading on a list ("$15.16", "<$0.01", "$0"). The exact amount is
 * formatUsd, shown beside it on hover.
 */
export function formatUsdShort(n: number): string {
  if (n === 0) return "$0";
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a < 0.01) return `${sign}<$0.01`;
  return `${sign}$${a.toLocaleString("en-US", CENTS)}`;
}

/**
 * A unit price rounded for reading: cents from $0.10 up ("$1.25", "$2.00"), otherwise 2
 * significant figures ("$0.084", "$0.034"). The exact price is formatUsd, shown on hover.
 */
export function formatPriceShort(n: number): string {
  const a = Math.abs(n);
  const body = a >= 0.1 ? a.toLocaleString("en-US", CENTS) : plainDecimal(Number(a.toPrecision(2)));
  return `${n < 0 ? "−" : ""}$${body}`;
}

/** The amount a person reads and types for a line: token prices per 1M, every other meter per unit. */
export function displayAmount(meter: Meter, unitUsd: number): number {
  return isTokenMeter(meter) ? Number((unitUsd * 1e6).toPrecision(12)) : unitUsd;
}

export function formatUnitPrice(meter: Meter, unitUsd: number): string {
  return formatUsd(displayAmount(meter, unitUsd));
}

export function formatPriceLine(line: PriceLine): string {
  const words = line.meter.replace(/_/g, " ");
  const isToken = isTokenMeter(line.meter);
  const amount = storedDecimal(displayAmount(line.meter, line.unit_usd));
  const unit = isToken ? `1M ${words}s` : words;
  const when = Object.entries(line.when ?? {});
  const cond = when.length
    ? ` (${when.map(([k, v]) => `${k} ${typeof v === "boolean" ? (v ? "on" : "off") : v}`).join(", ")})`
    : "";
  return `$${amount} / ${unit}${cond}`;
}

/** The first two lines, then "+N more". */
export function formatPriceSummary(lines: PriceLine[]): string {
  const shown = lines.slice(0, 2).map(formatPriceLine).join(", ");
  const more = lines.length - 2;
  return more > 0 ? `${shown} +${more} more` : shown;
}
