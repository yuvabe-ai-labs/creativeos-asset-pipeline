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

describe("the six permissions", () => {
  it("are view, edit, generate, approve, share, delete, in that order", () => {
    expect(PERMISSIONS).toEqual(["view", "edit", "generate", "approve", "share", "delete"]);
  });

  it("plus three owner-only actions make the nine actions", () => {
    expect(ACTIONS).toEqual([...PERMISSIONS, "manage_team", "manage_clients", "view_credits"]);
    expect(isAction("manage_team")).toBe(true);
    expect(isPermission("manage_team")).toBe(false);
    expect(isAction("scripts.view")).toBe(false);
  });

  it("drops anything that is not one of the six", () => {
    expect([...toPermissionSet(["view", "scripts.approve", 7, null, "share"])]).toEqual(["view", "share"]);
    expect(toPermissionSet(null).size).toBe(0);
  });

  it("orders a set the canonical way", () => {
    expect(orderedPermissions(new Set(["delete", "view", "approve"] as const))).toEqual(["view", "approve", "delete"]);
  });
});

describe("accessFromRows", () => {
  it("builds one OrgAccess per row, keyed by agency", () => {
    const access = accessFromRows("u1", false, [
      row({ permissions: ["view", "edit"], clients: [{ client_id: "c1", permissions: ["view", "edit"] }] }),
    ]);
    const org = access.orgs.get("org-1")!;
    expect(access.userId).toBe("u1");
    expect(access.isSuperAdmin).toBe(false);
    expect(org.orgName).toBe("Acme Agency");
    expect(org.accessGiven).toBe(true);
    expect([...org.permissions]).toEqual(["view", "edit"]);
    expect([...org.clients.get("c1")!]).toEqual(["view", "edit"]);
  });

  it("counts only viewable rows of someone with access given towards anyClient", () => {
    const given = accessFromRows("u1", false, [
      row({ clients: [{ client_id: "c1", permissions: ["view", "approve"] }, { client_id: "c2", permissions: ["delete"] }] }),
    ]).orgs.get("org-1")!;
    expect([...given.anyClient].sort()).toEqual(["approve", "view"]);
    const waiting = accessFromRows("u1", false, [
      row({ access_given_at: null, clients: [{ client_id: "c1", permissions: ["view"] }] }),
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
