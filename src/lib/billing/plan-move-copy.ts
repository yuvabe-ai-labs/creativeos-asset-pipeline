import { formatIstDate } from "@/lib/admin/ist";
import { formatRupees } from "./pricing";

// What a plan's move to another price says on each screen (D593). Client-safe and pure. A move is
// only announced once the payment service has agreed to charge the new price (`scheduled`); a
// move that is waiting or was refused never says the price changes.

/** Why a plan can't move: it is paid by UPI or a bank mandate (those can't be changed), or the
 *  payment service refused for another reason. */
export type MoveRefusal = "upi" | "emandate" | "other";

export type MoveState = "scheduled" | "waiting" | "refused";

/** The plan's move as the owner and Admin's Billing card read it. */
export type NextPrice = {
  priceId: string;
  planName: string | null;
  amountMinor: number;
  credits: number;
  state: MoveState;
  refused: MoveRefusal | null;
};

/** Plans on one price marked to move to another, by how far the move got (admin_price_moves). */
export type PriceMove = {
  priceId: string;
  nextPriceId: string;
  state: MoveState;
  refused: MoveRefusal | null;
  agencies: number;
  firstRenewal: string | null;
  lastRenewal: string | null;
  /** UPI or a bank mandate: the owners are asked to approve, and the plans end between these dates
   *  if they don't (0104, D595). Null otherwise. */
  firstEnd: string | null;
  lastEnd: string | null;
  /** The agencies refused, by name (empty otherwise). */
  orgs: { id: string; name: string }[];
};

export function moveState(scheduledAt: string | null, refused: MoveRefusal | null): MoveState {
  return refused ? "refused" : scheduledAt ? "scheduled" : "waiting";
}

const REFUSAL_WORDS: Record<MoveRefusal, { one: string; many: string }> = {
  upi: { one: "pays by UPI", many: "pay by UPI" },
  emandate: { one: "pays by bank mandate", many: "pay by bank mandate" },
  other: { one: "couldn't be moved", many: "couldn't be moved" },
};

/** "pays by UPI" / "pay by bank mandate". */
export function refusalWords(refused: MoveRefusal, count: number): string {
  return count === 1 ? REFUSAL_WORDS[refused].one : REFUSAL_WORDS[refused].many;
}

const day = (iso: string) => formatIstDate(new Date(iso));

/** "on 3 Dec 2026", or "between 3 Dec 2026 and 28 Dec 2026". */
export function renewalWindow(first: string | null, last: string | null): string {
  if (!first) return "";
  const a = day(first);
  const b = last ? day(last) : a;
  return a === b ? `on ${a}` : `between ${a} and ${b}`;
}

/** The owner's Billing line under an active plan: "Renews 3 Dec 2026." with what changes then, only
 *  when the change is set up. */
export function ownerRenewalLine(currentPlan: string | null, periodEnd: string | null, next: NextPrice | null): string {
  const renews = `Renews ${periodEnd ? day(periodEnd) : "every month"}.`;
  if (!next || next.state !== "scheduled") return renews;
  const price = `${formatRupees(next.amountMinor)} a month + GST for ${next.credits.toLocaleString("en-IN")} credits`;
  if (next.planName && next.planName !== currentPlan) return `${renews} ${next.planName} starts then: ${price}.`;
  return `${renews} From then your plan is ${price}.`;
}

/** Admin's Billing card, after "Renews 3 Dec 2026": what happens to the price then. */
export function adminRenewalNote(currentPlan: string | null, next: NextPrice | null): string {
  if (!next) return "";
  const to = `${next.planName && next.planName !== currentPlan ? `${next.planName} at ` : ""}${formatRupees(next.amountMinor)} a month`;
  if (next.state === "scheduled") return ` · moves to ${to} then`;
  if (next.state === "refused" && next.refused) {
    return next.refused === "other"
      ? ` · stays on this price: the move to ${to} was refused`
      : ` · stays on this price: ${refusalWords(next.refused, 1)}, so it can't move to ${to}`;
  }
  return ` · move to ${to} not set up yet`;
}
