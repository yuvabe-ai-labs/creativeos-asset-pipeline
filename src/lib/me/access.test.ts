// src/lib/me/access.test.ts
import { describe, it, expect } from "vitest";
import { check } from "@/lib/permissions/check";
import { accessFromMe } from "./access";
import { testMePayload } from "./test-fixtures";

// D504: the browser builds the same Access the server checked, from what /api/me sent.
describe("accessFromMe", () => {
  it("answers each client the way its row says", () => {
    const access = accessFromMe(testMePayload({
      permissions: ["view", "edit"],
      clients: [{ clientId: "c1", permissions: ["view", "edit"] }, { clientId: "c2", permissions: ["view"] }],
    }));
    expect(check(access, "edit", { orgId: "org-1", clientId: "c1" })).toBe("allow");
    expect(check(access, "edit", { orgId: "org-1", clientId: "c2" })).toBe("forbidden");
    expect(check(access, "view", { orgId: "org-1", clientId: "c3" })).toBe("not_found");
  });

  it("gives the owner everything and a waiting person nothing", () => {
    expect(check(accessFromMe(testMePayload({ isOwner: true, clients: [] })), "manage_team", { orgId: "org-1", clientId: null })).toBe("allow");
    expect(check(accessFromMe(testMePayload({ accessGiven: false })), "view", { orgId: "org-1", clientId: "c1" })).toBe("not_found");
  });

  it("lets a super admin through, as the server does", () => {
    expect(check(accessFromMe(testMePayload({ platformRole: "super_admin", clients: [] })), "delete", { orgId: "org-1", clientId: "c9" })).toBe("allow");
  });
});
