import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({ rpc: m.rpc, from: m.from }) }));

import { setBillingMode, grantCredits, takeBackCredits, setGrantEnd, listBillingLog } from "../billing-admin";

beforeEach(() => { m.rpc.mockReset(); m.from.mockReset(); });

// A query builder that records its chain and answers with rows.
function builder(rows: unknown[]) {
  const calls: unknown[][] = [];
  const b: Record<string, unknown> = {};
  for (const name of ["select", "eq", "in", "order", "limit"]) b[name] = (...a: unknown[]) => { calls.push([name, ...a]); return b; };
  b.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
  return { b, calls };
}

describe("billing admin data", () => {
  it("sets the billing mode", async () => {
    m.rpc.mockResolvedValue({ data: true, error: null });
    await expect(setBillingMode("org", "plans", "admin", "Paying now")).resolves.toBe(true);
    expect(m.rpc).toHaveBeenCalledWith("admin_set_billing_mode", { p_org_id: "org", p_mode: "plans", p_actor: "admin", p_reason: "Paying now" });
  });

  it("grants credits ending at the end of the chosen day", async () => {
    m.rpc.mockResolvedValue({ data: "g1", error: null });
    await expect(grantCredits("org", "free", 50000, "2026-12-03", "admin", "Trial")).resolves.toBe("g1");
    expect(m.rpc).toHaveBeenCalledWith("admin_grant_credits", {
      p_org_id: "org", p_kind: "free", p_credits: 50000, p_ends_at: "2026-12-03T18:30:00.000Z", p_actor: "admin", p_reason: "Trial",
    });
  });

  it("passes on a take-back's answer", async () => {
    m.rpc.mockResolvedValue({ data: "too_many", error: null });
    await expect(takeBackCredits("g1", 900, "admin", "x")).resolves.toBe("too_many");
    expect(m.rpc).toHaveBeenCalledWith("admin_take_back_credits", { p_grant_id: "g1", p_credits: 900, p_actor: "admin", p_reason: "x" });
  });

  it("moves an end to a day, or to now", async () => {
    m.rpc.mockResolvedValue({ data: "ok", error: null });
    await setGrantEnd("g1", "2026-12-10", "admin", "Longer");
    expect(m.rpc).toHaveBeenLastCalledWith("admin_set_grant_end", expect.objectContaining({ p_ends_at: "2026-12-10T18:30:00.000Z" }));
    const before = Date.now();
    await setGrantEnd("g1", null, "admin", "Stop");
    const sent = m.rpc.mock.lastCall![1].p_ends_at as string;
    expect(new Date(sent).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("throws database errors", async () => {
    m.rpc.mockResolvedValue({ data: null, error: new Error("down") });
    await expect(setBillingMode("org", "plans", "a", "r")).rejects.toThrow("down");
  });

  it("lists the log newest first with who made each change, in two queries", async () => {
    const log = builder([
      { id: "l1", action: "grant", before: null, after: { kind: "free" }, reason: "Trial", created_at: "2026-11-20T06:00:00Z", actor_id: "u1" },
      { id: "l2", action: "billing_mode", before: {}, after: {}, reason: "x", created_at: "2026-11-19T06:00:00Z", actor_id: null },
    ]);
    const names = builder([{ user_id: "u1", display_name: "Yuva" }]);
    m.from.mockImplementation((t: string) => (t === "billing_log" ? log.b : names.b));
    await expect(listBillingLog("org")).resolves.toEqual([
      { id: "l1", action: "grant", before: null, after: { kind: "free" }, reason: "Trial", createdAt: "2026-11-20T06:00:00Z", actorName: "Yuva" },
      { id: "l2", action: "billing_mode", before: {}, after: {}, reason: "x", createdAt: "2026-11-19T06:00:00Z", actorName: null },
    ]);
    expect(log.calls).toContainEqual(["eq", "org_id", "org"]);
    expect(log.calls).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(log.calls).toContainEqual(["limit", 50]);
    expect(names.calls).toContainEqual(["in", "user_id", ["u1"]]);
  });
});
