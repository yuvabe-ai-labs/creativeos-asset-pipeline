import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: m.createServerSupabase }));

import { acceptInvitation, createLogin, findOpenInviteByEmail, insertInvitation, listOpenInvites, loginEmails, toInvite, toPerson } from "./people";

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
      .toEqual({ id: "i1", email: "p@x.com", clientId: "c1", clientName: "Chupps", asOwner: false, sentAt: "s", expiresAt: "e", invitedByName: null, link: "https://app.example/invite/tok1" });
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
      for (const name of ["select", "insert", "update", "eq", "in", "is", "gt", "lte", "order", "single", "maybeSingle"]) {
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

describe("open invites name who sent them (spec §6.1)", () => {
  beforeEach(() => { process.env.APP_URL = "https://app.example"; });

  it("reads the inviters' names in one batched profiles read, not one per invite", async () => {
    const { db, chains } = fakeDb([
      { data: [{ ...row, id: "i1", invited_by: "u-asha" }, { ...row, id: "i2", invited_by: "u-asha" }, { ...row, id: "i3", invited_by: "u-meera" }, { ...row, id: "i4", invited_by: null }] },
      { data: [{ user_id: "u-asha", display_name: "Asha" }, { user_id: "u-meera", display_name: "Meera" }] },
    ]);
    m.createServerSupabase.mockReturnValue(db);
    const invites = await listOpenInvites("org-1");
    expect(invites.map((i) => [i.id, i.invitedByName])).toEqual([["i1", "Asha"], ["i2", "Asha"], ["i3", "Meera"], ["i4", null]]);
    expect(chains).toHaveLength(2);
    expect(chains[0].calls[0]).toEqual(["select", expect.stringContaining("invited_by")]);
    expect(chains[1].table).toBe("profiles");
    expect(chains[1].calls).toContainEqual(["in", "user_id", ["u-asha", "u-meera"]]);
  });

  it("makes no profiles read when no invite names an inviter", async () => {
    const { db, chains } = fakeDb([{ data: [{ ...row, invited_by: null }] }]);
    m.createServerSupabase.mockReturnValue(db);
    expect((await listOpenInvites("org-1"))[0].invitedByName).toBeNull();
    expect(chains).toHaveLength(1);
  });

  it("throws when the profiles read fails", async () => {
    const { db } = fakeDb([{ data: [{ ...row, invited_by: "u-asha" }] }, { error: { message: "boom" } }]);
    m.createServerSupabase.mockReturnValue(db);
    await expect(listOpenInvites("org-1")).rejects.toEqual({ message: "boom" });
  });
});

describe("findOpenInviteByEmail", () => {
  it("selects only what it returns, never the token", async () => {
    const { db, chains } = fakeDb([{ data: { id: "i1", clients: { name: "Chupps" } } }]);
    m.createServerSupabase.mockReturnValue(db);
    expect(await findOpenInviteByEmail("org-1", "p@x.com")).toEqual({ id: "i1", clientName: "Chupps" });
    expect(chains[0].calls[0]).toEqual(["select", "id, clients(name)"]);
  });
});

describe("loginEmails", () => {
  it("logs an Auth admin error (without the address) and leaves that person out", async () => {
    const getUserById = vi.fn()
      .mockResolvedValueOnce({ data: { user: { email: "a@x.com" } }, error: null })
      .mockResolvedValueOnce({ data: { user: null }, error: { message: "admin down" } });
    m.createServerSupabase.mockReturnValue({ auth: { admin: { getUserById } } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loginEmails(["u1", "u2"])).toEqual(["a@x.com"]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(spy.mock.calls)).not.toContain("a@x.com");
    spy.mockRestore();
  });
});

describe("createLogin (spec §6.3)", () => {
  const withCreate = (result: { data: unknown; error: unknown }) => {
    const createUser = vi.fn(async () => result);
    m.createServerSupabase.mockReturnValue({ auth: { admin: { createUser } } });
    return createUser;
  };

  it("returns the new login's id", async () => {
    withCreate({ data: { user: { id: "u-new" } }, error: null });
    expect(await createLogin("p@x.com", "longenough")).toEqual({ ok: true, userId: "u-new" });
  });

  it("tells an email that already has a login apart from any other failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    withCreate({ data: { user: null }, error: { code: "email_exists", status: 422, message: "A user with this email address has already been registered" } });
    expect(await createLogin("p@x.com", "longenough")).toEqual({ ok: false, reason: "email_exists" });
    withCreate({ data: { user: null }, error: { code: "unexpected_failure", status: 500, message: "boom" } });
    expect(await createLogin("p@x.com", "longenough")).toEqual({ ok: false, reason: "failed" });
    withCreate({ data: { user: null }, error: null });
    expect(await createLogin("p@x.com", "longenough")).toEqual({ ok: false, reason: "failed" });
    spy.mockRestore();
  });
});

describe("acceptInvitation (spec §6.3)", () => {
  const withRpc = (result: { data: unknown; error: unknown }) => m.createServerSupabase.mockReturnValue({ rpc: vi.fn(async () => result) });

  it("returns the accepted row", async () => {
    withRpc({ data: [{ org_id: "org-1", client_id: "c1", as_owner: false, invited_by: "owner-1" }], error: null });
    expect(await acceptInvitation("tok", "u1", "Ravi")).toEqual({ orgId: "org-1", clientId: "c1", asOwner: false, invitedBy: "owner-1" });
  });

  it("returns null when the link is no longer valid (the function's no_data_found, or no row)", async () => {
    withRpc({ data: null, error: { code: "P0002", message: "This invite link is no longer valid." } });
    expect(await acceptInvitation("tok", "u1", "Ravi")).toBeNull();
    withRpc({ data: [], error: null });
    expect(await acceptInvitation("tok", "u1", "Ravi")).toBeNull();
  });

  it("throws any other failure, so a passing outage is not read as a dead link", async () => {
    withRpc({ data: null, error: { code: "08006", message: "connection failure" } });
    await expect(acceptInvitation("tok", "u1", "Ravi")).rejects.toMatchObject({ code: "08006" });
  });
});
