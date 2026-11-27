import { GST_PCT } from "./pricing";

/** What Razorpay charges for a price before GST: the amount with 18% GST, in paise. */
export function withGst(amountMinor: number): number {
  return Math.round(amountMinor * (1 + GST_PCT / 100));
}
