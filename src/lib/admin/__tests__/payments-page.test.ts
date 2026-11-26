import { describe, it, expect } from "vitest";
import { paymentAttentionItems } from "../payments-page";

const now = new Date("2026-11-26T06:00:00Z");

describe("Payments needs a look", () => {
  it("says what is unpaid, since when, what is paused and the day the plan ends", () => {
    const [item] = paymentAttentionItems(
      [{ orgId: "o1", orgName: "Northwind", planName: "Growth", status: "payment_due", periodEnd: null, amountMinor: 290_000, paymentDueSince: "2026-11-23T00:30:00Z" }],
      now,
    );
    expect(item).toMatchObject({
      tone: "bad",
      name: "Northwind",
      text: "Growth renewal of ₹3,422 unpaid since 23 Nov",
      detail: "AI runs are paused. The plan ends on 23 Dec if it stays unpaid.",
      action: "Open billing",
      href: "/admin/orgs/o1?tab=billing",
    });
  });

  it("says when a cancelled plan ends, counted in India days", () => {
    const [item] = paymentAttentionItems(
      [{ orgId: "o2", orgName: "Riverstone", planName: "Starter", status: "cancelling", periodEnd: "2026-11-29T05:00:00Z", amountMinor: 120_000, paymentDueSince: null }],
      now,
    );
    expect(item).toMatchObject({ tone: "warn", text: "Starter was cancelled and ends on 29 Nov, in 3 days", detail: "" });
  });

  it("still reads without a plan name, amount or due date", () => {
    const [item] = paymentAttentionItems([{ orgId: "o3", orgName: "X", planName: null, status: "payment_due", periodEnd: null, amountMinor: null, paymentDueSince: null }], now);
    expect(item.text).toBe("Plan renewal unpaid");
    expect(item.detail).toBe("AI runs are paused.");
  });
});
