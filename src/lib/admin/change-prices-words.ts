// The change-prices flow's words: the bulk-percent message and the review's primary action. Client-safe.
import { formatIstDate } from "./ist";
import type { When } from "./change-prices-when";

const signedPercent = (p: number) => `${p < 0 ? "−" : "+"}${Math.abs(p)}%`;
const prices = (n: number) => (n === 1 ? "1 price" : `${n} prices`);

/** The line under "Change every price by" after Apply. */
export function bulkMessage(a: { changed: number; kept: number; percent: number; hasOtherCharges: boolean; includeOtherCharges: boolean }): string {
  if (a.changed === 0 && a.kept === 0) return "No prices to change yet. Type a price into each cell first.";
  const other = a.hasOtherCharges ? (a.includeOtherCharges ? ", other charges included" : ". Other charges were left out") : "";
  const kept = a.kept ? ` ${prices(a.kept)} you typed ${a.kept > 1 ? "were" : "was"} left as ${a.kept > 1 ? "they are" : "it is"}.` : "";
  return `Changed ${prices(a.changed)} by ${signedPercent(a.percent)}, rounded to 4 significant figures${other}.${kept}`;
}

/** The review's one primary action. */
export function confirmLabel(a: { same: boolean; replaced: Date | null; mode: When["mode"]; at: Date }): string {
  if (a.same) return "Nothing new to save";
  if (a.replaced) return `Replace the ${formatIstDate(a.replaced, false)} change`;
  return a.mode === "now" ? "Apply new prices now" : `Schedule for ${formatIstDate(a.at, false)}`;
}
