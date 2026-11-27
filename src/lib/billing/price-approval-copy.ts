import { formatIstDate } from "@/lib/admin/ist";
import { formatRupees } from "./pricing";

// What the owner and Admin read about a new price that must be approved (D595). A plan paid by UPI
// or a bank mandate can't move to a new price on its own, so the owner approves it or the plan ends.
// Client-safe and pure; plain words, no payment service names.

/** Asked: approve by `endsAt` or the plan ends then. Approved: the new price starts `startsAt`. */
export type PriceApproval =
  | { state: "asked"; priceId: string; planName: string | null; amountMinor: number; credits: number; endsAt: string }
  | { state: "approved"; priceId: string; planName: string | null; amountMinor: number; credits: number; startsAt: string | null };

const day = (iso: string) => formatIstDate(new Date(iso));
const monthly = (minor: number) => `${formatRupees(minor)} a month`;

/** The owner's banner while the new price waits for approval. */
export function approvalAskText(a: { planName: string | null; amountMinor: number; endsAt: string }): string {
  const what = a.planName ? `The ${a.planName} price` : "Your plan's price";
  return `${what} changes to ${monthly(a.amountMinor)} + GST. Approve the new price before ${day(a.endsAt)}, or your plan ends then.`;
}

/** Under the button: what approving takes, and when the first payment is. */
export function approvalCheckText(a: { amountMinor: number; endsAt: string }, now = Date.now()): string {
  const first = new Date(a.endsAt).getTime() > now ? `on ${day(a.endsAt)}` : "today";
  return `You'll approve with a ₹5 check that's refunded. Your first payment of ${formatRupees(a.amountMinor)} (+ GST) is ${first}.`;
}

/** The owner's banner once approved. */
export function approvedText(a: { amountMinor: number; startsAt: string | null }): string {
  return `New price approved. Your plan continues ${a.startsAt ? `on ${day(a.startsAt)}` : "now"} at ${monthly(a.amountMinor)}.`;
}

/** Admin's Billing card, under the plan. */
export function adminApprovalLine(a: PriceApproval): string {
  return a.state === "asked"
    ? `Waiting for the owner to approve ${monthly(a.amountMinor)} until ${day(a.endsAt)}. The plan ends then if they don't.`
    : `New price approved: continues ${a.startsAt ? day(a.startsAt) : "now"} at ${monthly(a.amountMinor)}.`;
}

/** Admin's Billing card when the plan ended because the new price wasn't approved. */
export function adminNotApprovedLine(endsAt: string | null): string {
  return `Ended${endsAt ? ` ${day(endsAt)}` : ""}: the owner didn't approve the new price.`;
}
