import { describe, it, expect } from "vitest";
import { membersCrumbs, teamCrumbs, teamPersonHref } from "./nav";

const chupps = { name: "Chupps", slug: "chupps" };

describe("people screens: where you are", () => {
  it("heads a client's Members page with Clients › {Client} › Members", () => {
    expect(membersCrumbs(chupps)).toEqual([
      { label: "Clients", href: "/" },
      { label: "Chupps", href: "/clients/chupps" },
      { label: "Members" },
    ]);
  });

  it("heads the Team page with Clients › Team", () => {
    expect(teamCrumbs(null)).toEqual([{ label: "Clients", href: "/" }, { label: "Team" }]);
  });

  it("keeps the client's trail when the Team page was opened from its Members page", () => {
    expect(teamCrumbs(chupps)).toEqual([
      { label: "Clients", href: "/" },
      { label: "Chupps", href: "/clients/chupps" },
      { label: "Members", href: "/clients/chupps/members" },
      { label: "Team" },
    ]);
  });

  it("links Set permissions to the Team page, carrying the client it came from", () => {
    expect(teamPersonHref("u1")).toBe("/team?person=u1");
    expect(teamPersonHref("u1", "chupps")).toBe("/team?person=u1&from=chupps");
    expect(teamPersonHref("u 1", "a&b")).toBe("/team?person=u+1&from=a%26b");
  });
});
