// src/lib/permissions/model.test.ts
import { describe, it, expect } from "vitest";
import {
  ACTIONS,
  PERMISSIONS,
  accessFromRows,
  impersonatedAccess,
  isAction,
  isPermission,
  orderedPermissions,
  permissionFor,
  toPermissionSet,
  type MembershipAccessRow,
} from "./model";

const row = (over: Partial<MembershipAccessRow> = {}): MembershipAccessRow => ({
  org_id: "org-1",
  org_name: "Acme Agency",
  is_owner: false,
  access_given_at: "2026-11-13T09:00:00.000Z",
  permissions: [],
  clients: [],
  ...over,
});

describe("the five permissions", () => {
  it("are generate, approve, share, delete, invite, in that order", () => {
    expect(PERMISSIONS).toEqual(["generate", "approve", "share", "delete", "invite"]);
  });

  it("plus view, edit and three owner-only actions make the ten actions", () => {
    expect(ACTIONS).toEqual([...PERMISSIONS, "view", "edit", "manage_team", "manage_clients", "view_credits"]);
    expect(isAction("manage_team")).toBe(true);
    expect(isAction("view")).toBe(true);
    expect(isAction("edit")).toBe(true);
    expect(isAction("invite")).toBe(true);
    expect(isPermission("manage_team")).toBe(false);
    expect(isPermission("view")).toBe(false);
    expect(isPermission("edit")).toBe(false);
    expect(isAction("scripts.view")).toBe(false);
  });

  it("maps each client action to the permission it needs: view none, edit Generate", () => {
    expect(permissionFor("view")).toBeNull();
    expect(permissionFor("edit")).toBe("generate");
    for (const p of PERMISSIONS) expect(permissionFor(p)).toBe(p);
  });

  it("drops anything that is not one of the five, including the old view and edit", () => {
    expect([...toPermissionSet(["view", "edit", "scripts.approve", 7, null, "share", "invite"])]).toEqual(["share", "invite"]);
    expect(toPermissionSet(null).size).toBe(0);
  });

  it("orders a set the canonical way", () => {
    expect(orderedPermissions(new Set(["invite", "delete", "generate"] as const))).toEqual(["generate", "delete", "invite"]);
  });
});

describe("accessFromRows", () => {
  it("builds one OrgAccess per row, keyed by agency", () => {
    const access = accessFromRows("u1", false, [
      row({ permissions: ["generate", "approve"], clients: [{ client_id: "c1", permissions: ["generate"] }] }),
    ]);
    const org = access.orgs.get("org-1")!;
    expect(access.userId).toBe("u1");
    expect(access.isSuperAdmin).toBe(false);
    expect(org.orgName).toBe("Acme Agency");
    expect(org.accessGiven).toBe(true);
    expect([...org.permissions]).toEqual(["generate", "approve"]);
    expect([...org.clients.get("c1")!]).toEqual(["generate"]);
  });

  it("drops view and edit coming from the database", () => {
    const org = accessFromRows("u1", false, [
      row({ permissions: ["view", "edit", "approve"], clients: [{ client_id: "c1", permissions: ["view", "edit"] }] }),
    ]).orgs.get("org-1")!;
    expect([...org.permissions]).toEqual(["approve"]);
    expect(org.clients.get("c1")!.size).toBe(0);
    expect(org.anyClient.size).toBe(0);
  });

  it("counts every row of someone with access given towards anyClient, none while waiting", () => {
    const given = accessFromRows("u1", false, [
      row({ clients: [{ client_id: "c1", permissions: ["approve"] }, { client_id: "c2", permissions: ["delete"] }, { client_id: "c3", permissions: [] }] }),
    ]).orgs.get("org-1")!;
    expect([...given.anyClient].sort()).toEqual(["approve", "delete"]);
    const waiting = accessFromRows("u1", false, [
      row({ access_given_at: null, clients: [{ client_id: "c1", permissions: ["generate"] }] }),
    ]).orgs.get("org-1")!;
    expect(waiting.accessGiven).toBe(false);
    expect(waiting.anyClient.size).toBe(0);
  });

  it("reads a null client list as none", () => {
    expect(accessFromRows("u1", false, [row({ clients: null })]).orgs.get("org-1")!.clients.size).toBe(0);
  });
});

describe("impersonatedAccess", () => {
  it("is the target agency's owner, as a super admin", () => {
    const access = impersonatedAccess("op", "org-9");
    expect(access.isSuperAdmin).toBe(true);
    expect(access.orgs.get("org-9")?.isOwner).toBe(true);
    expect(access.orgs.size).toBe(1);
  });
});
