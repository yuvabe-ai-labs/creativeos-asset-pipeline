import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: m.createServerSupabase }));

import { listAgencySources } from "./admin-agencies";

type Answer = { data: unknown; error: unknown };

// A query builder per table that records its chain and answers with that table's rows.
function fakeDb(byTable: Record<string, unknown[]>, rpc: Answer | Error) {
  const chains: { table: string; calls: unknown[][] }[] = [];
  return {
    chains,
    db: {
      from(table: string) {
        const chain = { table, calls: [] as unknown[][] };
        chains.push(chain);
        const builder: Record<string, unknown> = {};
        for (const name of ["select", "eq", "neq", "is", "in", "gt", "lte", "order"]) {
          builder[name] = (...args: unknown[]) => { chain.calls.push([name, ...args]); return builder; };
        }
        builder.then = (resolve: (v: unknown) => void) => resolve({ data: byTable[table] ?? [], error: null });
        return builder;
      },
      rpc: vi.fn(async () => {
        if (rpc instanceof Error) throw rpc;
        return rpc;
      }),
    },
  };
}

const NOW = new Date("2026-11-26T12:00:00Z");
const TABLES = {
  organizations: [
    { id: "a", name: "Acme", billing_mode: "plans", monthly_credit_limit: null, clients: [{ count: 2 }] },
    { id: "b", name: "Bata", billing_mode: "managed", monthly_credit_limit: "5000", clients: [] },
  ],
  org_memberships: [{ org_id: "a" }],
  org_invitations: [{ org_id: "b", email: "new@bata.in", created_at: "2026-11-20T00:00:00Z", expires_at: "2026-11-27T00:00:00Z", token: "tok" }],
  org_credit_usage: [{ org_id: "b", credits_used: "4620" }],
  credit_grants: [{ org_id: "a", kind: "free", credits: "20000", used: "1000", ends_at: "2026-12-09T00:00:00Z" }],
  billing_subscriptions: [{ org_id: "a", status: "payment_due", payment_due_since: "2026-11-23T00:00:00Z", price: { interval_months: 1, product: [{ name: "Growth" }] } }],
};

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));

describe("listAgencySources (D590)", () => {
  it("reads everything in one round of parallel reads and joins it per agency", async () => {
    const { db, chains } = fakeDb(TABLES, { data: [{ org_id: "a", owner_email: "o@acme.in", member_count: 3, last_run_at: "2026-11-25T00:00:00Z" }], error: null });
    m.createServerSupabase.mockReturnValue(db);
    const [a, b] = await listAgencySources(NOW);

    expect(chains.map((c) => c.table).sort()).toEqual(["billing_subscriptions", "credit_grants", "org_credit_usage", "org_invitations", "org_memberships", "organizations"]);
    expect(db.rpc).toHaveBeenCalledWith("admin_agency_activity");
    expect(a).toMatchObject({
      hasOwner: true,
      clientCount: 2,
      activity: { ownerEmail: "o@acme.in", memberCount: 3, lastRunAt: "2026-11-25T00:00:00Z" },
      grants: [{ kind: "free", credits: 20000, used: 1000, endsAt: "2026-12-09T00:00:00Z" }],
      subscription: { status: "payment_due", paymentDueSince: "2026-11-23T00:00:00Z", planName: "Growth", intervalMonths: 1 },
    });
    expect(b).toMatchObject({ hasOwner: false, monthlyLimit: 5000, creditsUsedThisMonth: 4620, clientCount: 0, subscription: null, activity: { ownerEmail: null, memberCount: 0, lastRunAt: null } });
    expect(b.ownerInvite).toMatchObject({ email: "new@bata.in", link: expect.stringContaining("/invite/tok") });

    const grants = chains.find((c) => c.table === "credit_grants")!;
    expect(grants.calls).toEqual(expect.arrayContaining([["lte", "starts_at", NOW.toISOString()], ["gt", "ends_at", NOW.toISOString()]]));
    const invites = chains.find((c) => c.table === "org_invitations")!;
    expect(invites.calls).toEqual(expect.arrayContaining([["eq", "as_owner", true], ["is", "accepted_at", null], ["is", "revoked_at", null]]));
    expect(chains.find((c) => c.table === "billing_subscriptions")!.calls).toContainEqual(["neq", "status", "ended"]);
  });

  it("still lists every agency when the activity read fails, with activity unknown", async () => {
    for (const failure of [{ data: null, error: { message: "function not found" } }, new Error("network")]) {
      const { db } = fakeDb(TABLES, failure);
      m.createServerSupabase.mockReturnValue(db);
      const rows = await listAgencySources(NOW);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.activity === null)).toBe(true);
    }
  });

  it("throws when any other read fails, so the page shows Couldn't load, never an empty list", async () => {
    const { db } = fakeDb(TABLES, { data: [], error: null });
    const from = db.from.bind(db);
    db.from = (table: string) => {
      const b = from(table) as Record<string, unknown>;
      if (table === "credit_grants") b.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: new Error("boom") });
      return b as never;
    };
    m.createServerSupabase.mockReturnValue(db);
    await expect(listAgencySources(NOW)).rejects.toThrow("boom");
  });
});
