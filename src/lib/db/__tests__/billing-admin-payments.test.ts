import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({ from: m.from, rpc: m.rpc }) }));

import { countRenewingWithin, getPaymentTotals, listAdminPaymentsPage, listPayments, listPlansNeedingAttention } from "../billing-admin-payments";
import { DEFAULT_PAYMENT_FILTERS } from "@/lib/billing/admin-payments-filters";

function builder(rows: unknown[]) {
  const calls: unknown[][] = [];
  const b: Record<string, unknown> = {};
  for (const name of ["select", "eq", "neq", "gte", "lt", "lte", "ilike", "or", "order", "limit", "range"]) b[name] = (...a: unknown[]) => { calls.push([name, ...a]); return b; };
  b.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null, count: rows.length });
  return { b, calls };
}

const failedRenewal = { id: "p", org_id: "o", kind: "renewal", status: "failed", amount_paise: 1_200_000, total_minor: "1416000", paid_at: null, created_at: "2026-11-20T06:00:00Z", org: { name: "Acme" }, price: { product: { name: "Studio" } } };

beforeEach(() => {
  m.from.mockReset();
  m.rpc.mockReset();
});

describe("Admin › Payments ledger", () => {
  it("lists a page of this month's payments, every status, newest first, with the amount before and with GST", async () => {
    const q = builder([failedRenewal]);
    m.from.mockReturnValue(q.b);
    await expect(listPayments({ ...DEFAULT_PAYMENT_FILTERS, page: 2 })).resolves.toEqual({
      payments: [{ id: "p", orgId: "o", orgName: "Acme", kind: "renewal", status: "failed", totalMinor: 1_416_000, beforeGstMinor: 1_200_000, name: "Studio", at: "2026-11-20T06:00:00Z" }],
      total: 1,
    });
    expect(q.calls).toContainEqual(["range", 25, 49]);
    expect(q.calls).toContainEqual(["neq", "kind", "test"]);
    expect(q.calls.some((c) => c[0] === "eq" && c[1] === "status")).toBe(false);
    expect(q.calls.some((c) => c[0] === "gte" && c[1] === "created_at")).toBe(true);
    expect(q.calls).toContainEqual(["order", "created_at", { ascending: false }]);
  });

  it("filters by status and agency name, with the search's wildcards escaped, over all time", async () => {
    const q = builder([]);
    m.from.mockReturnValue(q.b);
    await listPayments({ range: "all", tab: "created", query: " 50%_off ", page: 1 });
    expect(q.calls).toContainEqual(["eq", "status", "created"]);
    expect(q.calls).toContainEqual(["ilike", "org.name", "%50\\%\\_off%"]);
    expect(String(q.calls.find((c) => c[0] === "select")?.[1])).toContain("org:organizations!inner(name)");
    expect(q.calls.some((c) => c[0] === "gte" || c[0] === "lt")).toBe(false);
  });

  it("totals each status in the database and adds them up for All", async () => {
    m.rpc.mockResolvedValue({ data: [{ status: "paid", payments: 3, total_minor: "4248000" }, { status: "refunded", payments: "1", total_minor: 14_750 }], error: null });
    await expect(getPaymentTotals({ range: "last_month", query: "" })).resolves.toEqual({
      counts: { all: 4, paid: 3, failed: 0, refunded: 1, created: 0 },
      amounts: { paid: 4_248_000, failed: 0, refunded: 14_750, created: 0 },
    });
    const [name, args] = m.rpc.mock.calls[0];
    expect(name).toBe("admin_payment_totals");
    expect(args).toMatchObject({ p_query: null });
    expect(args.p_from).toBeTruthy();
    expect(args.p_to).toBeTruthy();
  });

  it("reads the page and its totals together, and fails rather than look empty", async () => {
    m.from.mockReturnValue(builder([failedRenewal]).b);
    m.rpc.mockResolvedValue({ data: null, error: new Error("down") });
    await expect(listAdminPaymentsPage(DEFAULT_PAYMENT_FILTERS)).rejects.toThrow("down");
  });
});

describe("Admin › Payments needs a look", () => {
  it("lists due payments first, then plans ending soonest; plain renewals are left out", async () => {
    const q = builder([
      { org_id: "a", status: "cancelling", current_period_end: "2026-11-22T00:00:00Z", payment_due_since: null, org: { name: "A" }, price: null },
      { org_id: "b", status: "payment_due", current_period_end: "2026-11-25T00:00:00Z", payment_due_since: "2026-11-23T00:30:00Z", org: { name: "B" }, price: { amount_minor: "290000", product: { name: "Growth" } } },
    ]);
    m.from.mockReturnValue(q.b);
    const rows = await listPlansNeedingAttention(7);
    expect(rows.map((r) => r.orgId)).toEqual(["b", "a"]);
    expect(rows[0]).toMatchObject({ planName: "Growth", amountMinor: 290_000, paymentDueSince: "2026-11-23T00:30:00Z" });
    expect(rows[1].amountMinor).toBeNull();
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
