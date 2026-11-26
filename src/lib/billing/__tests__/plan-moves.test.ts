import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  list: vi.fn(), get: vi.fn(), nextId: vi.fn(), record: vi.fn(), price: vi.fn(), planFor: vi.fn(), schedule: vi.fn(),
  org: vi.fn(), owners: vi.fn(), emails: vi.fn(), send: vi.fn(), ask: vi.fn(),
}));
vi.mock("@/lib/db/billing-plan-moves", () => ({ listPendingMoves: m.list, getPendingMove: m.get, getNextPriceId: m.nextId, recordPlanMove: m.record }));
vi.mock("@/lib/db/billing-subscriptions", () => ({ getPurchasablePrice: m.price }));
vi.mock("@/lib/db/organizations", () => ({ getOrgById: m.org }));
vi.mock("@/lib/db/people", () => ({ ownerIds: m.owners, loginEmails: m.emails }));
vi.mock("@/lib/email/send", () => ({ sendEmail: m.send }));
vi.mock("../subscriptions", () => ({ razorpayPlanFor: m.planFor }));
vi.mock("../plan-change", () => ({ schedulePlanChange: m.schedule }));
vi.mock("../price-approval", () => ({ askForApproval: m.ask }));

import { movePendingPlans } from "../plan-moves";

const pending = (over: Record<string, unknown> = {}) => ({
  id: "row_1", orgId: "org_1", status: "active", priceId: "old", nextPriceId: "new", razorpaySubscriptionId: "sub_1", currentPeriodEnd: "2026-12-03T06:00:00Z", ...over,
});
const price = (id: string, amountMinor: number) => ({ id, amountMinor, credits: 100_000, product: { id: "prod", name: "Studio" } });

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  process.env.APP_URL = "https://app.example";
  m.list.mockResolvedValue([pending()]);
  m.get.mockResolvedValue(pending());
  m.price.mockImplementation(async (id: string) => price(id, id === "old" ? 1_000_000 : 1_200_000));
  m.planFor.mockImplementation(async (p: { id: string }) => `plan_${p.id}`);
  m.schedule.mockResolvedValue({ kind: "scheduled" });
  m.record.mockResolvedValue(true);
  m.org.mockResolvedValue({ id: "org_1", name: "Acme" });
  m.owners.mockResolvedValue(["u1"]);
  m.emails.mockResolvedValue(["owner@acme.test"]);
  m.send.mockResolvedValue({ sent: true });
});

describe("movePendingPlans (D593)", () => {
  it("sets up the move on Razorpay, saves it once and emails the owners the new price and day", async () => {
    await expect(movePendingPlans()).resolves.toEqual({ checked: 1, moved: 1, refused: 0, waiting: 0, failed: 0 });
    expect(m.schedule).toHaveBeenCalledWith("sub_1", "plan_new");
    expect(m.record).toHaveBeenCalledWith("row_1", "new", null);
    const email = m.send.mock.calls[0][0] as { to: string[]; text: string };
    expect(email.to).toEqual(["owner@acme.test"]);
    expect(email.text).toContain("From your renewal on 3 Dec 2026, the Studio plan for Acme is ₹14,160 a month with GST");
    expect(email.text).toContain("You pay ₹11,800 now.");
    expect(email.text).not.toMatch(/razorpay/i);
  });

  it("records a refusal without an email, and leaves a plan with a payment due for later", async () => {
    m.schedule.mockResolvedValue({ kind: "refused", refused: "upi" });
    await expect(movePendingPlans()).resolves.toMatchObject({ refused: 1 });
    expect(m.record).toHaveBeenCalledWith("row_1", "new", "upi");
    // UPI: the owner is asked to approve the new price (D595).
    expect(m.ask).toHaveBeenCalledWith("row_1");
    m.get.mockResolvedValue(pending({ status: "payment_due" }));
    await expect(movePendingPlans()).resolves.toMatchObject({ waiting: 1 });
    expect(m.send).not.toHaveBeenCalled();
  });

  it("asks no approval for a refusal that isn't UPI or a bank mandate (D595)", async () => {
    m.schedule.mockResolvedValue({ kind: "refused", refused: "other" });
    await movePendingPlans();
    expect(m.ask).not.toHaveBeenCalled();
  });

  it("skips a plan that moved on before it was reached", async () => {
    m.get.mockResolvedValue(null);
    await expect(movePendingPlans()).resolves.toEqual({ checked: 1, moved: 0, refused: 0, waiting: 0, failed: 0 });
    expect(m.schedule).not.toHaveBeenCalled();
  });

  it("puts Razorpay back on the owner's choice when they changed plan while it was asked", async () => {
    m.record.mockResolvedValue(false);
    m.nextId.mockResolvedValue("owner_pick");
    await movePendingPlans();
    expect(m.schedule).toHaveBeenLastCalledWith("sub_1", "plan_owner_pick");
    expect(m.send).not.toHaveBeenCalled();
  });

  it("counts a failure and carries on with the rest", async () => {
    m.list.mockResolvedValue([pending(), pending({ id: "row_2" })]);
    m.get.mockImplementation(async (id: string) => pending({ id }));
    m.schedule.mockImplementation(async () => {
      throw new Error("boom");
    });
    vi.useFakeTimers();
    const run = movePendingPlans();
    await vi.runAllTimersAsync();
    await expect(run).resolves.toMatchObject({ checked: 2, failed: 2 });
    vi.useRealTimers();
    expect(m.schedule).toHaveBeenCalledTimes(6);
  });
});
