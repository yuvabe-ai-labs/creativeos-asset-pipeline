import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  sched: vi.fn(), approve: vi.fn(), asked: vi.fn(), ending: vi.fn(), reminders: vi.fn(), approvedOrgs: vi.fn(), claim: vi.fn(),
  update: vi.fn(), price: vi.fn(), org: vi.fn(), owners: vi.fn(), emails: vi.fn(), send: vi.fn(), cancel: vi.fn(), getSub: vi.fn(),
}));
vi.mock("@/lib/db/billing-approvals", () => ({
  getScheduledSubscription: m.sched, recordPriceApproval: m.approve, getAskedPlan: m.asked, listEndingPlans: m.ending,
  listApprovalReminders: m.reminders, approvedOrgIds: m.approvedOrgs, claimApprovalReminder: m.claim,
}));
vi.mock("@/lib/db/billing-subscriptions", () => ({ updateSubscription: m.update, getPurchasablePrice: m.price }));
vi.mock("@/lib/db/organizations", () => ({ getOrgById: m.org }));
vi.mock("@/lib/db/people", () => ({ ownerIds: m.owners, loginEmails: m.emails }));
vi.mock("@/lib/email/send", () => ({ sendEmail: m.send }));
vi.mock("../razorpay", async (importOriginal) => ({
  RazorpayError: (await importOriginal<typeof import("../razorpay")>()).RazorpayError,
  cancelSubscription: m.cancel,
  getSubscription: m.getSub,
}));

import { askForApproval, dropPendingApproval, remindApprovals, stopFinalCycles } from "../price-approval";
import { RazorpayError } from "../razorpay";

const NOW = Date.parse("2026-11-26T00:00:00Z");
const plan = (over: Record<string, unknown> = {}) => ({
  id: "row_1", orgId: "org_1", status: "active", razorpaySubscriptionId: "sub_old", currentPeriodEnd: "2026-12-03T00:00:00Z",
  endsAt: "2026-12-03T00:00:00Z", nextPriceId: "new", refused: "upi", remindedAt: null, ...over,
});

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  process.env.APP_URL = "https://app.example";
  m.sched.mockResolvedValue(null);
  m.price.mockResolvedValue({ id: "new", amountMinor: 1_200_000, credits: 100_000, product: { id: "prod", name: "Studio" } });
  m.org.mockResolvedValue({ id: "org_1", name: "Acme" });
  m.owners.mockResolvedValue(["u1"]);
  m.emails.mockResolvedValue(["owner@acme.test"]);
  m.send.mockResolvedValue({ sent: true });
  m.cancel.mockResolvedValue({});
  m.approvedOrgs.mockResolvedValue(new Set());
  m.claim.mockResolvedValue(true);
});

describe("asking the owner to approve a new price (D595)", () => {
  it("drops an approval made for an earlier price, then emails the owners the price and the end date", async () => {
    m.asked.mockResolvedValue(plan());
    m.sched.mockResolvedValue({ id: "sched_1", orgId: "org_1", priceId: "older", razorpaySubscriptionId: "sub_sched", approvedAt: null });
    m.getSub.mockResolvedValue({ id: "sub_sched", status: "created", plan_id: "p" });
    await askForApproval("row_1");
    expect(m.cancel).toHaveBeenCalledWith("sub_sched", false);
    expect(m.update).toHaveBeenCalledWith("sched_1", { status: "ended" });
    const email = m.send.mock.calls[0][0] as { to: string[]; subject: string; text: string };
    expect(email.to).toEqual(["owner@acme.test"]);
    expect(email.text).toContain("₹14,160 a month with GST");
    expect(email.text).toContain("before 3 Dec 2026, or your plan ends that day");
    expect(email.text).not.toMatch(/razorpay|upi|mandate/i);
  });

  it("records an approval Razorpay has though its webhook hasn't come, and asks nothing", async () => {
    m.asked.mockResolvedValue(plan());
    m.sched.mockResolvedValue({ id: "sched_1", orgId: "org_1", priceId: "older", razorpaySubscriptionId: "sub_sched", approvedAt: null });
    m.getSub.mockResolvedValue({ id: "sub_sched", status: "authenticated", plan_id: "p" });
    await askForApproval("row_1");
    expect(m.approve).toHaveBeenCalledWith("sub_sched");
    expect(m.cancel).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
  });

  it("cancels any approval at once when the owner cancels or changes plan", async () => {
    m.sched.mockResolvedValue({ id: "sched_1", orgId: "org_1", priceId: "new", razorpaySubscriptionId: "sub_sched", approvedAt: "2026-11-27T00:00:00Z" });
    await expect(dropPendingApproval("org_1")).resolves.toBe("dropped");
    expect(m.cancel).toHaveBeenCalledWith("sub_sched", false);
    expect(m.update).toHaveBeenCalledWith("sched_1", { status: "ended" });
  });
});

describe("the final cycle (D595)", () => {
  it("stops the old subscription at the end of its final cycle and keeps Razorpay's date", async () => {
    m.ending.mockResolvedValue([plan({ currentPeriodEnd: "2026-12-04T00:00:00Z" })]);
    await expect(stopFinalCycles(NOW)).resolves.toMatchObject({ stopped: 1 });
    expect(m.cancel).toHaveBeenCalledWith("sub_old", true);
    expect(m.update).toHaveBeenCalledWith("row_1", { status: "cancelling", cancelAtPeriodEnd: true, endsUnlessApprovedAt: "2026-12-04T00:00:00Z" });
  });

  it("never stops one earlier than its final cycle", async () => {
    m.ending.mockResolvedValue([plan({ currentPeriodEnd: "2026-12-03T00:00:00Z", endsAt: "2027-01-03T00:00:00Z" })]);
    await expect(stopFinalCycles(NOW)).resolves.toMatchObject({ stopped: 0 });
    expect(m.cancel).not.toHaveBeenCalled();
  });

  it("reads a cancel Razorpay already has as done, and counts any other failure", async () => {
    m.ending.mockResolvedValue([plan()]);
    m.cancel.mockRejectedValueOnce(new RazorpayError("x", 400, "Subscription is already scheduled to cancel"));
    await expect(stopFinalCycles(NOW)).resolves.toMatchObject({ stopped: 1 });
    m.cancel.mockRejectedValueOnce(new RazorpayError("x", 0, ""));
    await expect(stopFinalCycles(NOW)).resolves.toMatchObject({ stopped: 0, failed: 1 });
  });
});

describe("the reminder (D595)", () => {
  it("reminds once, 3 days before, unless the price is approved", async () => {
    m.reminders.mockResolvedValue([plan({ endsAt: "2026-11-28T00:00:00Z" }), plan({ id: "row_2", orgId: "org_2", endsAt: "2026-11-28T00:00:00Z" })]);
    m.approvedOrgs.mockResolvedValue(new Set(["org_2"]));
    await expect(remindApprovals(NOW)).resolves.toMatchObject({ reminded: 1 });
    expect(m.reminders).toHaveBeenCalledWith("2026-11-26T00:00:00.000Z", "2026-11-29T00:00:00.000Z", 200);
    expect(m.claim).toHaveBeenCalledTimes(1);
    expect((m.send.mock.calls[0][0] as { subject: string }).subject).toBe("Approve your plan's new price by 28 Nov 2026");

    m.send.mockClear();
    m.claim.mockResolvedValue(false);
    await remindApprovals(NOW);
    expect(m.send).not.toHaveBeenCalled();
  });
});
