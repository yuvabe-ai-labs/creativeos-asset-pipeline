import { describe, it, expect } from "vitest";
import { adminApprovalLine, adminNotApprovedLine, approvalAskText, approvalCheckText, approvedText } from "../price-approval-copy";

describe("price approval copy (D595)", () => {
  const ask = { planName: "Studio", amountMinor: 1_200_000, endsAt: "2026-12-03T06:00:00Z" };

  it("tells the owner what changes, by when, and what approving takes, in plain words", () => {
    expect(approvalAskText(ask)).toBe("The Studio price changes to ₹12,000 a month + GST. Approve the new price before 3 Dec 2026, or your plan ends then.");
    expect(approvalCheckText(ask, Date.parse("2026-11-26T00:00:00Z"))).toBe("You'll approve with a ₹5 check that's refunded. Your first payment of ₹12,000 (+ GST) is on 3 Dec 2026.");
    expect(approvalCheckText(ask, Date.parse("2026-12-05T00:00:00Z"))).toContain("is today.");
    expect(approvedText({ amountMinor: 1_200_000, startsAt: ask.endsAt })).toBe("New price approved. Your plan continues on 3 Dec 2026 at ₹12,000 a month.");
    for (const text of [approvalAskText(ask), approvalCheckText(ask)]) expect(text).not.toMatch(/razorpay|upi|mandate/i);
  });

  it("tells Admin where the approval stands", () => {
    expect(adminApprovalLine({ state: "asked", priceId: "p", credits: 1, ...ask })).toBe("Waiting for the owner to approve ₹12,000 a month until 3 Dec 2026. The plan ends then if they don't.");
    expect(adminApprovalLine({ state: "approved", priceId: "p", planName: null, amountMinor: 1_200_000, credits: 1, startsAt: ask.endsAt })).toBe("New price approved: continues 3 Dec 2026 at ₹12,000 a month.");
    expect(adminNotApprovedLine(ask.endsAt)).toBe("Ended 3 Dec 2026: the owner didn't approve the new price.");
  });
});
