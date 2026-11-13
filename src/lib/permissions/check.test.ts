// src/lib/permissions/check.test.ts
import { describe, it, expect } from "vitest";
import { accessFromRows, impersonatedAccess, PERMISSIONS, type MembershipAccessRow, type Permission } from "./model";
import { check, clientIdsWith, isWaiting, FORBIDDEN_MESSAGE } from "./check";

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
    for (const action of [...ALL, "manage_team", "manage_clients", "view_credits"] as const) {
      expect(check(owner(), action, on("client-added-later"))).toBe("allow");
    }
    expect(check(owner(), "manage_team", on(null))).toBe("allow");
  });

  it("4. forbids the owner-only actions to a member holding all six", () => {
    const m = member({ c1: ALL });
    expect(check(m, "manage_team", on("c1"))).toBe("forbidden");
    expect(check(m, "manage_clients", on(null))).toBe("forbidden");
    expect(check(m, "view_credits", on(null))).toBe("forbidden");
  });

  it("5. answers not found before access is given, off the client, or without View on it", () => {
    expect(check(member({ c1: ALL }, { access_given_at: null }), "view", on("c1"))).toBe("not_found");
    expect(check(member({ c1: ALL }), "view", on("c2"))).toBe("not_found");
    expect(check(member({ c1: ["edit", "generate"] }), "edit", on("c1"))).toBe("not_found");
  });

  it("6. allows what the client row holds and forbids the rest", () => {
    const m = member({ c1: ["view", "edit"] });
    expect(check(m, "view", on("c1"))).toBe("allow");
    expect(check(m, "edit", on("c1"))).toBe("allow");
    expect(check(m, "generate", on("c1"))).toBe("forbidden");
    expect(check(m, "delete", on("c1"))).toBe("forbidden");
  });

  it("lets a person with View only see the client and do nothing else", () => {
    const m = member({ c1: ["view"] });
    expect(check(m, "view", on("c1"))).toBe("allow");
    for (const action of ["edit", "generate", "approve", "share", "delete"] as const) {
      expect(check(m, action, on("c1"))).toBe("forbidden");
    }
  });

  it("decides each client by its own row (a database edit, spec §8)", () => {
    const m = member({ c1: ["view", "edit", "generate"], c2: ["view"] }, { permissions: ["view", "edit", "generate"] });
    expect(check(m, "generate", on("c1"))).toBe("allow");
    expect(check(m, "generate", on("c2"))).toBe("forbidden");
  });

  it("without a client, asks whether the person holds the action on a client they can view", () => {
    const m = member({ c1: ["view", "approve"], c2: ["approve"] });
    expect(check(m, "approve", on(null))).toBe("allow");
    expect(check(m, "delete", on(null))).toBe("forbidden");
    expect(check(member({ c2: ["approve"] }), "approve", on(null))).toBe("not_found");
    expect(check(member({}), "view", on(null))).toBe("not_found");
  });

  it("ignores stored values that are not one of the six", () => {
    expect(check(member({ c1: ["view", "scripts.approve" as Permission] }), "approve", on("c1"))).toBe("forbidden");
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

  it("lists, sorted, the clients the person can view that hold the action", () => {
    const m = member({ c2: ["view", "approve"], c1: ["view", "approve"], c3: ["view"], c4: ["approve"] });
    expect(clientIdsWith(m, "org-1", "approve")).toEqual(["c1", "c2"]);
    expect(clientIdsWith(m, "org-1", "view")).toEqual(["c1", "c2", "c3"]);
  });

  it("is empty before access is given and in another agency", () => {
    expect(clientIdsWith(member({ c1: ALL }, { access_given_at: null }), "org-1", "view")).toEqual([]);
    expect(clientIdsWith(member({ c1: ALL }), "org-2", "view")).toEqual([]);
  });
});

describe("isWaiting (spec §2.4)", () => {
  it("is true for someone signed up and waiting, and for someone on no client they can view", () => {
    expect(isWaiting(member({ c1: [] }, { access_given_at: null }), "org-1")).toBe(true);
    expect(isWaiting(member({}), "org-1")).toBe(true);
    expect(isWaiting(member({ c1: ["edit"] }), "org-1")).toBe(true);
  });

  it("is false for a member who can view a client, the owner, and a super admin", () => {
    expect(isWaiting(member({ c1: ["view"] }), "org-1")).toBe(false);
    expect(isWaiting(owner(), "org-1")).toBe(false);
    expect(isWaiting(accessFromRows("op", true, []), "org-1")).toBe(false);
  });
});

describe("refusal copy", () => {
  it("is the agreed sentence", () => {
    expect(FORBIDDEN_MESSAGE).toBe("You don't have access to this. Ask your agency owner.");
  });
});
