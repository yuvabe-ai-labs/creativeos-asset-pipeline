// src/lib/permissions/check.test.ts
import { describe, it, expect } from "vitest";
import { accessFromRows, ACTIONS, impersonatedAccess, PERMISSIONS, type MembershipAccessRow, type Permission } from "./model";
import { check, clientIdsWith, clientPermissionsFor, isWaiting, FORBIDDEN_MESSAGE } from "./check";

function row(over: Partial<MembershipAccessRow> = {}): MembershipAccessRow {
  return {
    org_id: "org-1",
    org_name: "Acme Agency",
    is_owner: false,
    access_given_at: "2026-11-13T09:00:00.000Z",
    permissions: [],
    clients: [],
    ...over,
  };
}
function member(clients: Record<string, Permission[]>, over: Partial<MembershipAccessRow> = {}) {
  return accessFromRows("u1", false, [
    row({ clients: Object.entries(clients).map(([client_id, permissions]) => ({ client_id, permissions })), ...over }),
  ]);
}
const owner = () => accessFromRows("u1", false, [row({ is_owner: true })]);
const on = (clientId: string | null, orgId = "org-1") => ({ orgId, clientId });
const ALL: Permission[] = [...PERMISSIONS];

describe("check, in the order of spec §4.2", () => {
  it("1. lets a super admin do anything, in any agency", () => {
    const admin = accessFromRows("op", true, []);
    expect(check(admin, "manage_team", on(null, "org-9"))).toBe("allow");
    expect(check(admin, "delete", on("c1", "org-9"))).toBe("allow");
  });

  it("2. answers not found in an agency the person is not in", () => {
    expect(check(member({ c1: ALL }), "view", on("c1", "org-2"))).toBe("not_found");
    expect(check(member({ c1: ALL }), "manage_team", on(null, "org-2"))).toBe("not_found");
  });

  it("3. lets the owner do everything on every client, including one added later", () => {
    for (const action of ACTIONS) {
      expect(check(owner(), action, on("client-added-later"))).toBe("allow");
    }
    expect(check(owner(), "manage_team", on(null))).toBe("allow");
  });

  it("4. answers not found for a client the person is not on, before any owner-only refusal", () => {
    for (const action of ACTIONS) {
      expect(check(member({ c1: ALL }), action, on("c2")), action).toBe("not_found");
      expect(check(member({ c1: [] }), action, on("c2")), action).toBe("not_found");
      expect(check(member({ c1: ALL }, { access_given_at: null }), action, on("c1")), action).toBe("not_found");
      expect(check(member({}, { access_given_at: null }), action, on("c1")), action).toBe("not_found");
    }
  });

  it("5. forbids the owner-only actions on a client the person is on, and without a client", () => {
    const m = member({ c1: ALL });
    expect(check(m, "manage_team", on("c1"))).toBe("forbidden");
    expect(check(m, "manage_clients", on("c1"))).toBe("forbidden");
    expect(check(m, "manage_clients", on(null))).toBe("forbidden");
    expect(check(m, "view_credits", on(null))).toBe("forbidden");
    expect(check(member({ c1: [] }), "manage_team", on("c1"))).toBe("forbidden");
  });

  it("6. without a client, answers not found for someone waiting or on no client", () => {
    expect(check(member({}), "view", on(null))).toBe("not_found");
    expect(check(member({}), "generate", on(null))).toBe("not_found");
    // Step 5 comes first: an owner-only action is refused before "on no client" is asked.
    expect(check(member({}), "manage_team", on(null))).toBe("forbidden");
    expect(check(member({ c1: ALL }, { access_given_at: null }), "view", on(null))).toBe("not_found");
  });

  it("7. lets someone on a client with no permissions look and do nothing else", () => {
    const m = member({ c1: [] });
    expect(check(m, "view", on("c1"))).toBe("allow");
    for (const action of ["edit", ...ALL, "manage_team"] as const) {
      expect(check(m, action, on("c1")), action).toBe("forbidden");
    }
  });

  it("7. edit needs Generate", () => {
    expect(check(member({ c1: ["generate"] }), "edit", on("c1"))).toBe("allow");
    expect(check(member({ c1: ["approve", "share", "delete", "invite"] }), "edit", on("c1"))).toBe("forbidden");
  });

  it("7. allows what the client row holds and forbids the rest", () => {
    const m = member({ c1: ["generate", "approve"] });
    expect(check(m, "generate", on("c1"))).toBe("allow");
    expect(check(m, "approve", on("c1"))).toBe("allow");
    expect(check(m, "share", on("c1"))).toBe("forbidden");
    expect(check(m, "delete", on("c1"))).toBe("forbidden");
  });

  it("checks Invite on the named client like the other permissions", () => {
    const m = member({ a: ["invite"], b: [] });
    expect(check(m, "invite", on("a"))).toBe("allow");
    expect(check(m, "invite", on("b"))).toBe("forbidden");
  });

  it("answers not found for a row whose access is not given yet, even for view", () => {
    expect(check(member({ c1: [] }, { access_given_at: null }), "view", on("c1"))).toBe("not_found");
  });

  it("decides each client by its own row (a database edit, spec §8)", () => {
    const m = member({ c1: ["generate"], c2: [] }, { permissions: ["generate"] });
    expect(check(m, "generate", on("c1"))).toBe("allow");
    expect(check(m, "generate", on("c2"))).toBe("forbidden");
  });

  it("without a client, asks whether the person holds the action on any client they are on", () => {
    const one = member({ c1: [] });
    expect(check(one, "view", on(null))).toBe("allow");
    expect(check(one, "generate", on(null))).toBe("forbidden");
    expect(check(one, "edit", on(null))).toBe("forbidden");
    const m = member({ c1: [], c2: ["approve", "generate"] });
    expect(check(m, "approve", on(null))).toBe("allow");
    expect(check(m, "edit", on(null))).toBe("allow");
    expect(check(m, "delete", on(null))).toBe("forbidden");
  });

  it("ignores stored values that are not one of the five", () => {
    expect(check(member({ c1: ["scripts.approve" as Permission] }), "approve", on("c1"))).toBe("forbidden");
    expect(check(member({ c1: ["edit" as Permission] }), "edit", on("c1"))).toBe("forbidden");
  });

  it("treats a super admin viewing as an agency as its owner", () => {
    expect(check(impersonatedAccess("op", "org-9"), "manage_team", on(null, "org-9"))).toBe("allow");
  });
});

describe("clientIdsWith", () => {
  it("is null (every client of the agency) for the owner and a super admin", () => {
    expect(clientIdsWith(owner(), "org-1", "view")).toBeNull();
    expect(clientIdsWith(accessFromRows("op", true, []), "org-9", "approve")).toBeNull();
  });

  it("lists, sorted, every client the person is on for view, and those holding the permission otherwise", () => {
    const m = member({ c2: ["approve"], c1: ["approve", "generate"], c3: [] });
    expect(clientIdsWith(m, "org-1", "approve")).toEqual(["c1", "c2"]);
    expect(clientIdsWith(m, "org-1", "view")).toEqual(["c1", "c2", "c3"]);
    expect(clientIdsWith(m, "org-1", "edit")).toEqual(["c1"]);
  });

  it("is empty before access is given and in another agency", () => {
    expect(clientIdsWith(member({ c1: ALL }, { access_given_at: null }), "org-1", "view")).toEqual([]);
    expect(clientIdsWith(member({ c1: ALL }), "org-2", "view")).toEqual([]);
  });
});

describe("isWaiting (spec §2.4)", () => {
  it("is true for someone signed up and waiting, and for a member on no client", () => {
    expect(isWaiting(member({ c1: [] }, { access_given_at: null }), "org-1")).toBe(true);
    expect(isWaiting(member({}), "org-1")).toBe(true);
  });

  it("is false for a member on a client (even with no permissions), the owner, and a super admin", () => {
    expect(isWaiting(member({ c1: [] }), "org-1")).toBe(false);
    expect(isWaiting(owner(), "org-1")).toBe(false);
    expect(isWaiting(accessFromRows("op", true, []), "org-1")).toBe(false);
  });
});

describe("clientPermissionsFor", () => {
  it("answers view, edit and the five permissions", () => {
    expect(clientPermissionsFor(member({ c1: ["generate"] }), "org-1", "c1")).toEqual({
      view: true, edit: true, generate: true, approve: false, share: false, delete: false, invite: false,
    });
  });
});

describe("refusal copy", () => {
  it("is the agreed sentence", () => {
    expect(FORBIDDEN_MESSAGE).toBe("You don't have access to this. Ask your agency owner.");
  });
});
