// How a price line reads to a person. Client-safe; shared by the models list and price history.
import type { PriceLine } from "./types";

/** A plain decimal, never exponent form, with trailing zeros trimmed. */
function plain(n: number): string {
  const s = n.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
  return s === "" || s === "-0" ? "0" : s;
}

export function formatPriceLine(line: PriceLine): string {
  const words = line.meter.replace(/_/g, " ");
  const isToken = line.meter.endsWith("_token");
  const amount = isToken ? plain(parseFloat((line.unit_usd * 1e6).toPrecision(6))) : plain(line.unit_usd);
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
