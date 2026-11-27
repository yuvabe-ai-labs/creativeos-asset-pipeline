import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ guards: [] as unknown[], verify: vi.fn() }));
vi.mock("@/lib/api/route-helpers", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers")),
  withAccess: (_req: Request, guard: unknown, fn: (caller: { userId: string }, orgId: string) => Promise<Response>) => {
    m.guards.push(guard);
    return fn({ userId: "user-1" }, "org-1");
  },
}));
vi.mock("@/lib/billing/razorpay", () => ({ verifyCheckoutSignature: m.verify }));

import { POST } from "./route";

const req = (body: unknown) =>
  new Request("http://x/api/billing/test-confirm", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const good = { orderId: "order_1", paymentId: "pay_1", signature: "sig" };

describe("POST /api/billing/test-confirm", () => {
  beforeEach(() => {
    process.env.RAZORPAY_TEST_PAGE = "1";
    m.guards = [];
    m.verify.mockReset();
    m.verify.mockReturnValue(true);
  });

  it("is 404 without the test switch", async () => {
    delete process.env.RAZORPAY_TEST_PAGE;
    expect((await POST(req(good))).status).toBe(404);
  });

  it("is owner only and answers received for a good signature", async () => {
    const res = await POST(req(good));
    expect(m.guards).toEqual([{ need: "view_credits" }]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(m.verify).toHaveBeenCalledWith("order_1", "pay_1", "sig");
  });

  it("answers 400 for a bad signature or missing details", async () => {
    m.verify.mockReturnValue(false);
    expect((await POST(req(good))).status).toBe(400);
    expect((await POST(req({ orderId: "order_1" }))).status).toBe(400);
  });

  it("answers 400 without verifying when a field is not a string", async () => {
    expect((await POST(req({ ...good, signature: 12345 }))).status).toBe(400);
    expect(m.verify).not.toHaveBeenCalled();
  });
});
