import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: m.createServerSupabase }));

import { listOrgsWithClientCount } from "./organizations";

// A query builder per table that records its chain and answers with that table's rows.
function fakeDb(byTable: Record<string, unknown[]>) {
  const chains: { table: string; calls: unknown[][] }[] = [];
  return {
    chains,
    db: {
      from(table: string) {
        const chain = { table, calls: [] as unknown[][] };
        chains.push(chain);
        const builder: Record<string, unknown> = {};
        for (const name of ["select", "eq", "is", "in", "order"]) {
          builder[name] = (...args: unknown[]) => { chain.calls.push([name, ...args]); return builder; };
        }
        builder.then = (resolve: (v: unknown) => void) => resolve({ data: byTable[table] ?? [], error: null });
        return builder;
      },
    },
  };
}

const org = (id: string) => ({ id, name: id, slug: id, monthly_credit_limit: null, created_at: "2026-11-01T00:00:00Z", clients: [{ count: 2 }] });

describe("listOrgsWithClientCount (spec §6.6)", () => {
  it("tells an owned agency from one with an open owner invite and one with neither, in three parallel reads", async () => {
    const { db, chains } = fakeDb({
      organizations: [org("owned"), org("invited"), org("none")],
      org_memberships: [{ org_id: "owned" }],
      org_invitations: [{ org_id: "invited" }],
    });
    m.createServerSupabase.mockReturnValue(db);
    const rows = await listOrgsWithClientCount();
    expect(rows.map((r) => [r.id, r.owner_status])).toEqual([["owned", "owned"], ["invited", "invited"], ["none", "none"]]);
    expect(rows[0].client_count).toBe(2);

    expect(chains).toHaveLength(3);
    const invites = chains.find((c) => c.table === "org_invitations")!;
    expect(invites.calls).toEqual(expect.arrayContaining([["eq", "as_owner", true], ["is", "accepted_at", null], ["is", "revoked_at", null]]));
  });
});
