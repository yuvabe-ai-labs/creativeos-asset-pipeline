import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: m.createServerSupabase }));

import { findOpenInviteByEmail, insertInvitation, toInvite, toPerson } from "./people";

describe("people rows", () => {
  it("map a list_agency_people row to a person with a status", () => {
    const base = {
      user_id: "u1", display_name: "Ravi", email: "r@x.com", is_owner: false, access_given_at: null,
      permissions: ["share", "generate", "view", "nonsense"], joined_at: "2026-11-12T10:00:00Z", invited_by_name: "Asha",
      invited_client_id: "c1", invited_client_name: "Chupps", client_ids: ["c1"],
    };
    // "view" is not a permission any more (plan 3 Task 11): dropped like any unknown value.
    expect(toPerson(base)).toEqual({
      userId: "u1", name: "Ravi", email: "r@x.com", status: "signed_up", permissions: ["generate", "share"],
      joinedAt: "2026-11-12T10:00:00Z", invitedByName: "Asha", invitedClient: { id: "c1", name: "Chupps" }, clientIds: ["c1"],
    });
    expect(toPerson({ ...base, access_given_at: "2026-11-13T00:00:00Z" }).status).toBe("member");
    // Access given with no permissions: a member who can look.
    expect(toPerson({ ...base, access_given_at: "2026-11-13T00:00:00Z", permissions: [] })).toMatchObject({ status: "member", permissions: [] });
    expect(toPerson({ ...base, is_owner: true }).status).toBe("owner");
    expect(toPerson({ ...base, invited_client_id: null, invited_client_name: null, client_ids: null }).invitedClient).toBeNull();
  });

  it("map an invitation row with its client name and its stored link (the same every time)", () => {
    process.env.APP_URL = "https://app.example";
    expect(toInvite({ id: "i1", email: "p@x.com", client_id: "c1", as_owner: false, created_at: "s", expires_at: "e", token: "tok1", clients: { name: "Chupps" } }))
      .toEqual({ id: "i1", email: "p@x.com", clientId: "c1", clientName: "Chupps", asOwner: false, sentAt: "s", expiresAt: "e", link: "https://app.example/invite/tok1" });
    expect(toInvite({ id: "i2", email: "o@x.com", client_id: null, as_owner: true, created_at: "s", expires_at: "e", token: "tok2", clients: null }).clientName).toBeNull();
  });
});

// A query builder that records each chain and answers with the next queued result.
type Call = [string, ...unknown[]];
function fakeDb(results: { data?: unknown; error?: unknown }[]) {
  const chains: { table: string; calls: Call[] }[] = [];
  const db = {
    from(table: string) {
      const chain = { table, calls: [] as Call[] };
      chains.push(chain);
      const builder: Record<string, unknown> = {};
      for (const name of ["select", "insert", "update", "eq", "is", "gt", "lte", "order", "single", "maybeSingle"]) {
        builder[name] = (...args: unknown[]) => { chain.calls.push([name, ...args]); return builder; };
      }
      builder.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null, ...results.shift() });
      return builder;
    },
  };
  return { db, chains };
}

const row = { id: "i1", email: "p@x.com", client_id: "c1", as_owner: false, created_at: "s", expires_at: "e", token: "tok", clients: { name: "Chupps" } };

describe("an expired open invite (ledger, plan 4 must b)", () => {
  beforeEach(() => { process.env.APP_URL = "https://app.example"; });

  it("does not count as already invited", async () => {
    const { db, chains } = fakeDb([{ data: null }]);
    m.createServerSupabase.mockReturnValue(db);
    expect(await findOpenInviteByEmail("org-1", "p@x.com")).toBeNull();
    expect(chains[0].calls).toContainEqual(["gt", "expires_at", expect.any(String)]);
  });

  it("is revoked before a new invite to the same email, so the one-open-invite rule lets it through", async () => {
    const { db, chains } = fakeDb([{ data: [] }, { data: row }]);
    m.createServerSupabase.mockReturnValue(db);
    const invite = await insertInvitation({ orgId: "org-1", clientId: "c1", email: "p@x.com", token: "tok", invitedBy: "owner-1" });
    expect(invite.link).toBe("https://app.example/invite/tok");

    const [revoke, insert] = chains;
    expect(revoke.calls[0]).toEqual(["update", { revoked_at: expect.any(String) }]);
    expect(revoke.calls).toEqual(expect.arrayContaining([
      ["eq", "org_id", "org-1"], ["eq", "email", "p@x.com"], ["is", "accepted_at", null], ["is", "revoked_at", null], ["lte", "expires_at", expect.any(String)],
    ]));
    expect(insert.calls[0]).toEqual(["insert", expect.objectContaining({ org_id: "org-1", client_id: "c1", email: "p@x.com", token: "tok", invited_by: "owner-1" })]);
  });
});
