import type { BillingMode, OpenGrant } from "./grants";

// The agency's billing at a glance, for the workspace bar and the credits popover (D523). Owners
// get the numbers; members get only whether AI runs are paused (they never see credits).

export type BillingState =
  | "managed" // Yuvabe pays; the monthly limit applies
  | "payment_due" // the plan's payment failed or waits for approval: runs stopped
  | "no_plan" // paying, no credits and no paid plan: pick a plan
  | "free" // running on free credits, no paid plan yet
  | "used_up" // on a plan, credits used up: top up
  | "low" // 80% or more of the open credits used
  | "ok";

export type OwnerBillingSummary = {
  mode: BillingMode;
  state: BillingState;
  left: number;
  total: number;
  freeLeft: number;
  freeEndsAt: string | null;
  planEndsAt: string | null;
};

export type MemberBillingSummary = { mode: BillingMode; paused: boolean };

export const LOW_CREDITS_SHARE = 0.8;

type SubscriptionLike = { status: string; currentPeriodEnd: string | null } | null;

export function summarizeBilling(mode: BillingMode, grants: OpenGrant[], subscription: SubscriptionLike): OwnerBillingSummary {
  const left = grants.reduce((s, g) => s + g.left, 0);
  const total = grants.reduce((s, g) => s + g.credits, 0);
  const free = grants.filter((g) => g.kind === "free");
  const freeLeft = free.reduce((s, g) => s + g.left, 0);
  // The soonest end among free grants that still have credits; an emptied grant ends nothing.
  const freeWithCredits = free.filter((g) => g.left > 0);
  const freeEndsAt = freeWithCredits.length ? freeWithCredits.map((g) => g.endsAt).sort()[0] : null;
  const paidPlan = !!subscription && subscription.status !== "created";
  const base = { mode, left, total, freeLeft, freeEndsAt, planEndsAt: paidPlan ? subscription.currentPeriodEnd : null };

  if (mode === "managed") return { ...base, state: "managed" };
  if (subscription?.status === "payment_due") return { ...base, state: "payment_due" };
  if (left <= 0) return { ...base, state: paidPlan ? "used_up" : "no_plan" };
  if (!paidPlan && freeLeft > 0) return { ...base, state: "free" };
  if (total > 0 && (total - left) / total >= LOW_CREDITS_SHARE) return { ...base, state: "low" };
  return { ...base, state: "ok" };
}

/** Whether AI runs are stopped, the one thing members are told. */
export function isPaused(s: OwnerBillingSummary): boolean {
  return s.state === "payment_due" || s.state === "no_plan" || s.state === "used_up";
}
