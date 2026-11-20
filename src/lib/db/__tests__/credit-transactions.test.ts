import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({ rpc: m.rpc }) }));

import { reserveCredits, settleGeneration, refundReservation } from "../credit-transactions";

beforeEach(() => m.rpc.mockReset());

describe("reserveCredits", () => {
  it("holds through reserve_credits_v2", async () => {
    m.rpc.mockResolvedValue({ data: "ok", error: null });
    await expect(reserveCredits("org", "gen", 300)).resolves.toEqual({ ok: true });
    expect(m.rpc).toHaveBeenCalledWith("reserve_credits_v2", { p_org_id: "org", p_generation_id: "gen", p_amount: 300 });
  });

  it.each(["limit", "used_up", "free_ended", "no_credits"])("passes on the reason %s", async (reason) => {
    m.rpc.mockResolvedValue({ data: reason, error: null });
    await expect(reserveCredits("org", "gen", 300)).resolves.toEqual({ ok: false, reason });
  });

  it("throws on an answer it doesn't know rather than letting the run through", async () => {
    m.rpc.mockResolvedValue({ data: true, error: null });
    await expect(reserveCredits("org", "gen", 300)).rejects.toThrow("reserve_credits_v2");
  });

  it("throws a database error", async () => {
    m.rpc.mockResolvedValue({ data: null, error: new Error("down") });
    await expect(reserveCredits("org", "gen", 300)).rejects.toThrow("down");
  });
});

describe("settleGeneration and refundReservation", () => {
  it("settles through settle_credits", async () => {
    m.rpc.mockResolvedValue({ data: true, error: null });
    await settleGeneration({ orgId: "org", generationId: "gen", actualAmount: 250 });
    expect(m.rpc).toHaveBeenCalledWith("settle_credits", { p_org_id: "org", p_generation_id: "gen", p_actual: 250 });
  });

  it("treats a repeat settle (false) as done", async () => {
    m.rpc.mockResolvedValue({ data: false, error: null });
    await expect(settleGeneration({ orgId: "org", generationId: "gen", actualAmount: 250 })).resolves.toBeUndefined();
  });

  it("refunds through refund_credits", async () => {
    m.rpc.mockResolvedValue({ data: true, error: null });
    await refundReservation({ orgId: "org", generationId: "gen" });
    expect(m.rpc).toHaveBeenCalledWith("refund_credits", { p_org_id: "org", p_generation_id: "gen" });
  });

  it("throws a database error on either", async () => {
    m.rpc.mockResolvedValue({ data: null, error: new Error("down") });
    await expect(settleGeneration({ orgId: "o", generationId: "g", actualAmount: 1 })).rejects.toThrow("down");
    await expect(refundReservation({ orgId: "o", generationId: "g" })).rejects.toThrow("down");
  });
});
