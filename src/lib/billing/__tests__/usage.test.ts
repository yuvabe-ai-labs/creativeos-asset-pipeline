import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({ rpc: m.rpc, from: m.from }) }));

import { usageRange, isUsageBy, isUsagePeriod } from "../usage-period";
import { getUsageBy, listUsageRuns } from "@/lib/db/billing-usage";

function builder(rows: unknown[], count?: number) {
  const calls: unknown[][] = [];
  const b: Record<string, unknown> = {};
  for (const name of ["select", "eq", "in", "is", "gt", "gte", "lt", "order", "range"]) b[name] = (...a: unknown[]) => { calls.push([name, ...a]); return b; };
  b.then = (resolve: (v: unknown) => void) => resolve({ data: rows, count, error: null });
  return { b, calls };
}

beforeEach(() => { m.rpc.mockReset(); m.from.mockReset(); });

describe("usage months (India time)", () => {
  it("runs from the 1st at midnight in India to the next 1st", () => {
    expect(usageRange("this_month", new Date("2026-11-21T06:00:00Z"))).toEqual({ from: "2026-10-31T18:30:00.000Z", to: "2026-11-30T18:30:00.000Z" });
    expect(usageRange("last_month", new Date("2026-11-21T06:00:00Z"))).toEqual({ from: "2026-09-30T18:30:00.000Z", to: "2026-10-31T18:30:00.000Z" });
  });

  it("counts the evening of the 31st in India as the next month", () => {
    expect(usageRange("this_month", new Date("2026-10-31T19:00:00Z")).from).toBe("2026-10-31T18:30:00.000Z");
  });

  it("goes back across a year", () => {
    expect(usageRange("last_month", new Date("2027-01-10T06:00:00Z"))).toEqual({ from: "2026-11-30T18:30:00.000Z", to: "2026-12-31T18:30:00.000Z" });
  });

  it("accepts only known groups and months", () => {
    expect(isUsageBy("canvas")).toBe(true);
    expect(isUsageBy("team")).toBe(false);
    expect(isUsagePeriod("last_month")).toBe(true);
    expect(isUsagePeriod("all")).toBe(false);
  });
});

describe("who used what reads", () => {
  const range = { from: "2026-10-31T18:30:00.000Z", to: "2026-11-30T18:30:00.000Z" };

  it("sums by member, names each, and names the group with no one", async () => {
    m.rpc.mockResolvedValue({ data: [{ key: "u1", credits: "1200.5", runs: 3 }, { key: null, credits: 40, runs: 1 }], error: null });
    const names = builder([{ user_id: "u1", display_name: "Asha" }]);
    m.from.mockReturnValue(names.b);
    await expect(getUsageBy("org", "member", range)).resolves.toEqual([
      { key: "u1", name: "Asha", detail: null, credits: 1200.5, runs: 3 },
      { key: null, name: "Someone no longer in the agency", detail: null, credits: 40, runs: 1 },
    ]);
    expect(m.rpc).toHaveBeenCalledWith("org_credit_usage_by", { p_org_id: "org", p_from: range.from, p_to: range.to, p_by: "member" });
    expect(names.calls).toContainEqual(["in", "user_id", ["u1"]]);
  });

  it("names canvases with their client", async () => {
    m.rpc.mockResolvedValue({ data: [{ key: "c1", credits: 10, runs: 1 }], error: null });
    m.from.mockReturnValue(builder([{ id: "c1", name: "Diwali reel", client: { name: "Chupps" } }]).b);
    await expect(getUsageBy("org", "canvas", range)).resolves.toEqual([{ key: "c1", name: "Diwali reel", detail: "Chupps", credits: 10, runs: 1 }]);
  });

  it("lists one canvas's runs through their node, newest first, for this agency only", async () => {
    const runs = builder([{ id: "g1", type: "image", model_used: "flux", credits_charged: "12", created_at: "2026-11-20T06:00:00Z", user_id: "u1" }], 1);
    const people = builder([{ user_id: "u1", display_name: "Asha" }]);
    m.from.mockImplementation((t: string) => (t === "generations" ? runs.b : people.b));
    await expect(listUsageRuns("org", "canvas", "c1", range, 1)).resolves.toEqual({
      runs: [{ id: "g1", type: "image", model: "flux", credits: 12, createdAt: "2026-11-20T06:00:00Z", memberName: "Asha" }],
      total: 1,
    });
    expect(runs.calls[0][1]).toContain("node:nodes!inner(canvas_id)");
    expect(runs.calls).toContainEqual(["eq", "org_id", "org"]);
    expect(runs.calls).toContainEqual(["eq", "node.canvas_id", "c1"]);
    expect(runs.calls).toContainEqual(["range", 0, 19]);
  });

  it("lists runs off a canvas as the ones with no node", async () => {
    const runs = builder([], 0);
    m.from.mockReturnValue(runs.b);
    await listUsageRuns("org", "canvas", null, range, 2);
    expect(runs.calls).toContainEqual(["is", "node_id", null]);
    expect(runs.calls).toContainEqual(["range", 20, 39]);
  });
});
