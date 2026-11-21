import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/hooks/queries/billing", () => {
  const m = () => ({ mutateAsync: vi.fn(), isPending: false });
  return { useSubscribe: m, useConfirmSubscription: m, useStartTopUp: m, useConfirmTopUp: m, useCancelPlan: m, useChangePlan: m };
});

import { ownerLine } from "../billing-bar";
import { PlansGrid } from "../owner/plans-grid";
import { PaymentsList } from "../owner/payments-list";
import { PlanSummary } from "../owner/plan-summary";
import { CreditGrantList } from "../credit-grant-list";
import { ProfileCredits } from "@/components/identity/profile-credits";
import type { OwnerBillingSummary } from "@/lib/billing/summary";

const summary = (over: Partial<OwnerBillingSummary>): OwnerBillingSummary => ({ mode: "plans", state: "ok", left: 0, total: 0, freeLeft: 0, freeEndsAt: null, planEndsAt: null, ...over });
const plans = [
  { priceId: "p1", productId: "a", name: "Starter", description: null, amountMinor: 1_200_000, credits: 100_000 },
  { priceId: "p2", productId: "b", name: "Studio", description: "For growing teams", amountMinor: 2_400_000, credits: 200_000 },
];
const sub = { id: "s", status: "active" as const, priceId: "p1", nextPriceId: null, planName: "Starter", amountMinor: 1_200_000, credits: 100_000, currentPeriodEnd: "2026-12-21T00:00:00Z", razorpaySubscriptionId: "sub_1" };

describe("the workspace bar", () => {
  it("shows free credits and when they end, with a way to the plans", () => {
    expect(ownerLine(summary({ state: "free", freeLeft: 48_000, freeEndsAt: "2026-12-03T18:30:00.000Z" }))).toMatchObject({
      text: "You have 48,000 free credits until 3 Dec 2026.",
      action: { label: "See plans", href: "/billing/plans" },
    });
  });

  it("warns about a due payment and credits used up; nudges at 80%", () => {
    expect(ownerLine(summary({ state: "payment_due" }))).toMatchObject({ tone: "warn", action: { href: "/billing" } });
    expect(ownerLine(summary({ state: "used_up" }))).toMatchObject({ tone: "warn", action: { label: "Top up" } });
    expect(ownerLine(summary({ state: "low", left: 20_000 }))?.text).toBe("You've used 80% of this month's credits. 20,000 left.");
  });

  it("says nothing when all is well or the agency is managed", () => {
    expect(ownerLine(summary({ state: "ok" }))).toBeNull();
    expect(ownerLine(summary({ mode: "managed", state: "managed" }))).toBeNull();
  });
});

describe("the owner's plans page", () => {
  it("offers to pick a plan when there is none", () => {
    const html = renderToStaticMarkup(<PlansGrid plans={plans} subscription={null} />);
    expect(html).toContain("Pick Starter");
    expect(html).toContain("₹12,000");
    expect(html).toContain("1,00,000 credits every month");
  });

  it("marks the current plan and offers to change to the others", () => {
    const html = renderToStaticMarkup(<PlansGrid plans={plans} subscription={sub} />);
    expect(html).toContain("Your plan");
    expect(html).toContain("Current plan");
    expect(html).toContain("Change to Studio");
    expect(html).not.toContain("Pick Studio");
  });
});

describe("the owner's billing page", () => {
  it("says when the plan renews, and offers change and cancel", () => {
    const html = renderToStaticMarkup(<PlanSummary subscription={sub} />);
    expect(html).toContain("Starter");
    expect(html).toContain("Renews 21 Dec 2026.");
    expect(html).toContain("Change plan");
    expect(html).toContain("Cancel plan");
  });

  it("explains a due payment without naming the payment company", () => {
    const html = renderToStaticMarkup(<PlanSummary subscription={{ ...sub, status: "payment_due" }} />);
    expect(html).toContain("Payment due");
    expect(html).toContain("AI runs are paused");
    expect(html).not.toMatch(/razorpay/i);
  });

  it("lists credits by kind with their end, and payments with GST", () => {
    const grants = renderToStaticMarkup(<CreditGrantList grants={[{ id: "g", kind: "topup", credits: 25_000, used: 5_000, left: 20_000, endsAt: "2026-12-20T18:30:00.000Z" }]} empty="none" />);
    expect(grants).toContain("Top-up");
    expect(grants).toContain("20,000 of 25,000 left");
    expect(grants).toContain("until 20 Dec 2026");
    const payments = renderToStaticMarkup(<PaymentsList payments={[{ id: "x", kind: "renewal", status: "paid", amountMinor: 1_200_000, taxMinor: 216_000, totalMinor: 1_416_000, credits: 100_000, paidAt: "2026-11-21T06:00:00Z", createdAt: "2026-11-21T06:00:00Z", name: "Starter" }]} />);
    expect(payments).toContain("Monthly renewal · Starter");
    expect(payments).toContain("₹14,160");
    expect(payments).toContain("incl. GST");
  });

  it("shows a paying owner credits left in the profile popover, with a way to Billing", () => {
    const html = renderToStaticMarkup(<ProfileCredits used={0} monthlyCreditLimit={null} paying={{ left: 48_000, total: 50_000 }} />);
    expect(html).toContain("48,000");
    expect(html).toContain("left");
    expect(html).toContain('href="/billing"');
  });
});
