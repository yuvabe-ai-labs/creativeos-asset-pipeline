import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/actions/billing-admin", () => ({
  setBillingModeAction: vi.fn(), grantCreditsAction: vi.fn(), takeBackCreditsAction: vi.fn(), setGrantEndAction: vi.fn(),
}));
vi.mock("@/lib/actions/admin", () => ({ updateOrgCreditLimitAction: vi.fn() }));

import { BillingTab } from "../billing-tab";
import type { OpenGrant } from "@/lib/billing/grants";

const free: OpenGrant = { id: "g1", kind: "free", credits: 50000, used: 1200, left: 48800, endsAt: "2026-12-03T18:30:00.000Z" };
const plan: OpenGrant = { id: "g2", kind: "plan", credits: 100000, used: 0, left: 100000, endsAt: "2026-12-24T18:30:00.000Z" };
const base = { orgId: "org", planType: "standard", monthlyLimit: 500, log: [] };

describe("Billing tab", () => {
  it("shows a managed agency's limit and no credits", () => {
    const html = renderToStaticMarkup(<BillingTab {...base} mode="managed" grants={[]} />);
    expect(html).toContain("Managed by Yuvabe");
    expect(html).toContain("Monthly credit limit");
    expect(html).not.toContain("Add credits");
    expect(html).toContain("Yuvabe pays. The agency is never charged.");
    expect(html).not.toContain("Custom plan");
  });

  it("marks a custom plan", () => {
    expect(renderToStaticMarkup(<BillingTab {...base} planType="custom" mode="plans" grants={[]} />)).toContain("Custom plan");
  });

  it("lists a paying agency's credits, first-ending first, with what is left", () => {
    const html = renderToStaticMarkup(<BillingTab {...base} mode="plans" grants={[free, plan]} />);
    expect(html).toContain("Pays for a plan");
    expect(html).not.toContain("Monthly credit limit");
    expect(html).toContain("1,48,800 left");
    expect(html).toContain("48,800 of 50,000 left");
    expect(html).toContain("until 3 Dec 2026");
    expect(html.indexOf("Free credits")).toBeLessThan(html.indexOf("1,00,000 of 1,00,000"));
    expect(html).toContain("Add credits");
    expect(html).not.toContain("Give free credits");
  });

  it("says runs are stopped when a paying agency has no credits", () => {
    const html = renderToStaticMarkup(<BillingTab {...base} mode="plans" grants={[]} />);
    expect(html).toContain("No credits. AI runs are stopped until credits are added or a plan is bought.");
  });

  it("writes the log in plain words with who and why", () => {
    const log = [{ id: "l1", action: "grant", before: null, after: { kind: "free", credits: 50000, ends_at: "2026-12-03T18:30:00Z" }, reason: "Trial", createdAt: new Date().toISOString(), actorName: "Yuva" }];
    const html = renderToStaticMarkup(<BillingTab {...base} mode="plans" grants={[]} log={log} />);
    expect(html).toContain("Gave 50,000 free credits until 3 Dec 2026");
    expect(html).toContain("Yuva · Trial");
  });

  const sub = { id: "s", status: "active" as const, priceId: "p", nextPriceId: null, planName: "Studio", amountMinor: 1_200_000, credits: 100_000, currentPeriodEnd: "2026-12-21T00:00:00Z", razorpaySubscriptionId: "sub_1", paymentDueSince: null };

  it("shows a paying agency's plan, its price and when it renews", () => {
    const html = renderToStaticMarkup(<BillingTab {...base} mode="plans" grants={[]} subscription={sub} />);
    expect(html).toContain("Studio");
    expect(html).toContain("₹12,000 a month + GST");
    expect(html).toContain("Active");
    expect(html).toContain("Renews 21 Dec 2026");
  });

  it("warns when a payment is due, and says when a cancelled plan ends", () => {
    expect(renderToStaticMarkup(<BillingTab {...base} mode="plans" grants={[]} subscription={{ ...sub, status: "payment_due" }} />))
      .toContain("AI runs are stopped until the payment goes through");
    expect(renderToStaticMarkup(<BillingTab {...base} mode="plans" grants={[]} subscription={{ ...sub, status: "cancelling" }} />))
      .toContain("Ends 21 Dec 2026");
  });

  it("says when a paying agency has no plan yet", () => {
    expect(renderToStaticMarkup(<BillingTab {...base} mode="plans" grants={[]} />)).toContain("No plan yet.");
  });
});
