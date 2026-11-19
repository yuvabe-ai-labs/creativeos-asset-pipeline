import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  guards: [] as unknown[],
  createOrder: vi.fn(),
  insert: vi.fn(),
}));
vi.mock("@/lib/api/route-helpers", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers")),
  withAccess: (_req: Request, guard: unknown, fn: (caller: { userId: string }, orgId: string) => Promise<Response>) => {
    m.guards.push(guard);
    return fn({ userId: "user-1" }, "org-1");
  },
}));
vi.mock("@/lib/billing/razorpay", () => ({ createOrder: m.createOrder, razorpayKeyId: () => "rzp_test_id" }));
vi.mock("@/lib/db/billing-payments", () => ({ insertCreatedPayment: m.insert }));

import { POST } from "./route";

const req = () => new Request("http://x/api/billing/test-order", { method: "POST" });

describe("POST /api/billing/test-order", () => {
  beforeEach(() => {
    process.env.RAZORPAY_TEST_PAGE = "1";
    m.guards = [];
    m.createOrder.mockReset();
    m.createOrder.mockResolvedValue({ id: "order_1", amount: 10000, currency: "INR", status: "created" });
    m.insert.mockReset();
    m.insert.mockResolvedValue(undefined);
  });

  it("is 404 without the test switch and creates nothing", async () => {
    delete process.env.RAZORPAY_TEST_PAGE;
    expect((await POST(req())).status).toBe(404);
    expect(m.createOrder).not.toHaveBeenCalled();
  });

  it("is owner only (view_credits)", async () => {
    await POST(req());
    expect(m.guards).toEqual([{ need: "view_credits" }]);
  });

  it("creates the pack's order for the agency and saves it as created", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orderId: "order_1", amountPaise: 10000, credits: 1000, keyId: "rzp_test_id" });
    expect(m.createOrder).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 10000, notes: { org_id: "org-1" } }));
    expect(m.insert).toHaveBeenCalledWith({ orgId: "org-1", orderId: "order_1", amountPaise: 10000, credits: 1000, createdBy: "user-1" });
  });

  it("answers plain words and saves nothing when the order fails", async () => {
    m.createOrder.mockRejectedValue(new Error("Could not start the payment."));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Could not start the payment." });
    expect(m.insert).not.toHaveBeenCalled();
  });
});
