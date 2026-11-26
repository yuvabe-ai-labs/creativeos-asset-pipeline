import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ get: vi.fn(), scheduled: vi.fn(), cancelScheduled: vi.fn(), change: vi.fn() }));
vi.mock("../razorpay", async (importOriginal) => ({
  RazorpayError: (await importOriginal<typeof import("../razorpay")>()).RazorpayError,
  getSubscription: m.get,
  getScheduledPlan: m.scheduled,
  cancelScheduledChange: m.cancelScheduled,
  changeSubscriptionPlan: m.change,
}));

import { refusalOf, schedulePlanChange } from "../plan-change";
import { RazorpayError } from "../razorpay";

const refused = (status: number, description: string) => new RazorpayError("Could not change the plan.", status, description);
const sub = (over: Record<string, unknown> = {}) => ({ id: "sub_1", status: "active", plan_id: "plan_old", has_scheduled_changes: false, ...over });

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.get.mockResolvedValue(sub());
  m.scheduled.mockResolvedValue(null);
});

describe("refusalOf (D593)", () => {
  it("tells a refusal that won't change from one worth trying again", () => {
    expect(refusalOf(refused(400, "subscriptions cannot be updated when payment mode is UPI"))).toBe("upi");
    expect(refusalOf(refused(400, "subscriptions cannot be updated when payment mode is emandate"))).toBe("emandate");
    expect(refusalOf(refused(400, "Can't update Subscription when Subscription is not in Authenticated or Active state"))).toBe("waiting");
    expect(refusalOf(refused(400, "Request failed because another subscription operation is in progress"))).toBeNull();
    expect(refusalOf(refused(400, "Something else"))).toBe("other");
    expect(refusalOf(refused(0, ""))).toBeNull();
    expect(refusalOf(refused(429, ""))).toBeNull();
    expect(refusalOf(refused(502, ""))).toBeNull();
    expect(refusalOf(new Error("database down"))).toBeNull();
  });
});

describe("schedulePlanChange", () => {
  it("changes the plan from the cycle end", async () => {
    await expect(schedulePlanChange("sub_1", "plan_new")).resolves.toEqual({ kind: "scheduled" });
    expect(m.scheduled).not.toHaveBeenCalled();
    expect(m.change).toHaveBeenCalledWith("sub_1", "plan_new");
  });

  it("sends nothing when Razorpay already has the plan, scheduled or charged", async () => {
    m.get.mockResolvedValue(sub({ has_scheduled_changes: true }));
    m.scheduled.mockResolvedValue("plan_new");
    await expect(schedulePlanChange("sub_1", "plan_new")).resolves.toEqual({ kind: "scheduled" });
    m.get.mockResolvedValue(sub({ plan_id: "plan_new" }));
    await expect(schedulePlanChange("sub_1", "plan_new")).resolves.toEqual({ kind: "scheduled" });
    expect(m.change).not.toHaveBeenCalled();
    expect(m.cancelScheduled).not.toHaveBeenCalled();
  });

  it("cancels a change scheduled to another plan before asking for this one: the last decision wins", async () => {
    m.get.mockResolvedValue(sub({ has_scheduled_changes: true }));
    m.scheduled.mockResolvedValue("plan_other");
    await expect(schedulePlanChange("sub_1", "plan_new")).resolves.toEqual({ kind: "scheduled" });
    expect(m.cancelScheduled).toHaveBeenCalledWith("sub_1");
    expect(m.change).toHaveBeenCalledWith("sub_1", "plan_new");
  });

  it("only drops the other change when the subscription is already charged on this plan", async () => {
    m.get.mockResolvedValue(sub({ plan_id: "plan_new", has_scheduled_changes: true }));
    m.scheduled.mockResolvedValue("plan_other");
    await expect(schedulePlanChange("sub_1", "plan_new")).resolves.toEqual({ kind: "scheduled" });
    expect(m.cancelScheduled).toHaveBeenCalledWith("sub_1");
    expect(m.change).not.toHaveBeenCalled();
  });

  it("waits while the subscription isn't active, and refuses UPI or a bank mandate without asking", async () => {
    m.get.mockResolvedValue(sub({ status: "halted" }));
    await expect(schedulePlanChange("sub_1", "plan_new")).resolves.toEqual({ kind: "waiting" });
    m.get.mockResolvedValue(sub({ payment_method: "upi" }));
    await expect(schedulePlanChange("sub_1", "plan_new")).resolves.toEqual({ kind: "refused", refused: "upi" });
    expect(m.change).not.toHaveBeenCalled();
  });

  it("turns a refusal that won't change into the outcome, and throws one worth a retry", async () => {
    m.change.mockRejectedValueOnce(refused(400, "subscriptions cannot be updated when payment mode is emandate"));
    await expect(schedulePlanChange("sub_1", "plan_new")).resolves.toEqual({ kind: "refused", refused: "emandate" });
    m.change.mockRejectedValueOnce(refused(503, ""));
    await expect(schedulePlanChange("sub_1", "plan_new")).rejects.toBeInstanceOf(RazorpayError);
  });
});
