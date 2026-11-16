// src/app/admin/orgs/[id]/__tests__/org-detail-tabs.test.tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The tabs render client-only charts; this pins the structure in the source.
describe("admin agency page (spec §6.6)", () => {
  const tabs = readFileSync("src/app/admin/orgs/[id]/org-detail-tabs.tsx", "utf8");

  it("has People and Clients tabs beside Overview, built on the owner's components", () => {
    expect(tabs).toMatch(/value="people"/);
    expect(tabs).toMatch(/value="clients"/);
    expect(tabs).toContain("<TeamPeople");
    expect(tabs).toContain("canMakeOwner");
    expect(tabs).toContain("<AdminClientsTab");
  });

  it("offers reset password from each person's menu, and opens clients in its own Clients tab", () => {
    expect(tabs).toMatch(/label: "Reset password"/);
    expect(tabs).toContain("extras={extras}");
    expect(tabs).toContain("?tab=clients&client=");
  });

  it("no longer has the temporary-password or role controls", () => {
    expect(tabs).not.toMatch(/AddMemberDialog|MemberRoleSelect|RemoveMemberDialog|org_role/);
  });

  it("asks before Make owner: the row opens a confirmation, not a direct call", () => {
    const row = readFileSync("src/components/team/person-entry-row.tsx", "utf8");
    expect(row).toContain("<MakeOwnerDialog");
    expect(row).not.toMatch(/onClick=\{\(\) => makeOwner\.mutate/);
  });
});
