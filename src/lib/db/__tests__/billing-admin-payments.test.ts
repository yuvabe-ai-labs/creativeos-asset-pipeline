import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({ from: m.from }) }));

import { countRenewingWithin, listPlansNeedingAttention, listRecentPayments, sumPaidSince } from "../billing-admin-payments";

function builder(rows: unknown[]) {
  const calls: unknown[][] = [];
  const b: Record<string, unknown> = {};
  for (const name of ["select", "eq", "neq", "gte", "lte", "or", "order", "limit", "range"]) b[name] = (...a: unknown[]) => { calls.push([name, ...a]); return b; };
  b.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null, count: rows.length });
  return { b, calls };
}

beforeEach(() => m.from.mockReset());

describe("Admin › Payments reads", () => {
  it("lists a page of real payments only (no test top-ups, nothing still open), newest first, with the total", async () => {
    const q = builder([{ id: "p", org_id: "o", kind: "renewal", status: "failed", amount_paise: 1_200_000, total_minor: "1416000", paid_at: null, created_at: "2026-11-20T06:00:00Z", org: { name: "Acme" }, price: { product: { name: "Studio" } } }]);
    m.from.mockReturnValue(q.b);
    await expect(listRecentPayments(2)).resolves.toEqual({ payments: [{ id: "p", orgId: "o", orgName: "Acme", kind: "renewal", status: "failed", totalMinor: 1_416_000, name: "Studio", at: "2026-11-20T06:00:00Z" }], total: 1 });
    expect(q.calls).toContainEqual(["range", 25, 49]);
    expect(q.calls).toContainEqual(["neq", "status", "created"]);
    expect(q.calls).toContainEqual(["neq", "kind", "test"]);
    expect(q.calls).toContainEqual(["order", "created_at", { ascending: false }]);
  });

  it("adds up what was paid since the month began, GST included", async () => {
    m.from.mockReturnValue(builder([{ total_minor: 1_416_000, amount_paise: 1_200_000 }, { total_minor: null, amount_paise: 300_000 }]).b);
    await expect(sumPaidSince("2026-10-31T18:30:00.000Z")).resolves.toEqual({ totalMinor: 1_716_000, count: 2 });
  });

  it("needs a look: due payments first, then plans ending soonest; plain renewals are left out", async () => {
    const q = builder([
      { org_id: "a", status: "cancelling", current_period_end: "2026-11-22T00:00:00Z", org: { name: "A" }, price: null },
      { org_id: "b", status: "payment_due", current_period_end: "2026-11-25T00:00:00Z", org: { name: "B" }, price: null },
    ]);
    m.from.mockReturnValue(q.b);
    const rows = await listPlansNeedingAttention(7);
    expect(rows.map((r) => r.orgId)).toEqual(["b", "a"]);
    const filter = q.calls.find((c) => c[0] === "or")?.[1] as string;
    expect(filter).toContain("status.eq.payment_due");
    expect(filter).toContain("status.eq.cancelling");
    expect(filter).not.toContain("active");
  });

  it("counts plans renewing within the week exactly, without loading them", async () => {
    const q = builder([]);
    q.b.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null, count: 412 });
    m.from.mockReturnValue(q.b);
    await expect(countRenewingWithin(7)).resolves.toBe(412);
    expect(q.calls).toContainEqual(["select", "id", { count: "exact", head: true }]);
    expect(q.calls).toContainEqual(["eq", "status", "active"]);
  });
});
