import { describe, it, expect } from "vitest";
import { adminClientCrumbs, orgTabUrl } from "../org-tabs";

const org = { id: "o1", name: "Acme" };
const path = "/admin/orgs/o1";

describe("admin agency page: crumbs and history URLs", () => {
  it("shows All clients › {Client} for an open client, All clients going back to the list", () => {
    expect(adminClientCrumbs("o1", { name: "Chupps" })).toEqual([
      { label: "All clients", href: "/admin/orgs/o1?tab=clients" },
      { label: "Chupps" },
    ]);
  });

  it("switching tab drops the opened client and person", () => {
    const current = new URLSearchParams("tab=clients&client=c1&person=u1");
    expect(orgTabUrl(path, current, { tab: "people" })).toBe("/admin/orgs/o1?tab=people");
  });

  it("opening a client keeps the tab and sets ?client", () => {
    expect(orgTabUrl(path, new URLSearchParams("tab=clients"), { tab: "clients", client: "c1" })).toBe(
      "/admin/orgs/o1?tab=clients&client=c1",
    );
  });

  it("can carry a person, and keeps unrelated params", () => {
    expect(orgTabUrl(path, new URLSearchParams("x=1"), { tab: "people", person: "u1" })).toBe(
      "/admin/orgs/o1?x=1&tab=people&person=u1",
    );
  });
});
