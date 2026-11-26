import { describe, it, expect } from "vitest";
import { chosenStillEligible, hideInviteLinks, inviteHolderView, invitesForClient, isValidEmail, normaliseEmail, peopleNotOnClient, peopleOnClient, peopleReadFor, signedUpPeople } from "./utils";
import type { AgencyPerson, OpenInvite } from "./types";
import { testAccess, testOwnerAccess } from "@/lib/permissions/test-fixtures";

const person = (over: Partial<AgencyPerson>): AgencyPerson => ({
  userId: "u", name: "N", email: "n@x.com", status: "member", permissions: ["generate"], joinedAt: "2026-11-01T00:00:00Z",
  invitedByName: null, invitedClient: null, clientIds: [], ...over,
});
const owner = person({ userId: "o", status: "owner", clientIds: [] });
const onC1 = person({ userId: "a", clientIds: ["c1"] });
const waitingOnC1 = person({ userId: "b", status: "signed_up", clientIds: ["c1"] });
const elsewhere = person({ userId: "c", clientIds: ["c2"] });

describe("people helpers", () => {
  it("checks and normalises emails", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(normaliseEmail("  Asha@Example.COM ")).toBe("asha@example.com");
  });

  it("puts the owner first on every client, then the people on it", () => {
    expect(peopleOnClient([onC1, owner, elsewhere, waitingOnC1], "c1").map((p) => p.userId)).toEqual(["o", "a", "b"]);
  });

  it("offers everyone else in the agency, waiting people included, never the owner", () => {
    expect(peopleNotOnClient([owner, onC1, waitingOnC1, elsewhere], "c1").map((p) => p.userId)).toEqual(["c"]);
  });

  it("lists who signed up and waits", () => {
    expect(signedUpPeople([owner, onC1, waitingOnC1]).map((p) => p.userId)).toEqual(["b"]);
  });

  it("keeps a client's open invites", () => {
    const inv = (id: string, clientId: string | null): OpenInvite => ({ id, email: `${id}@x.com`, clientId, clientName: null, asOwner: clientId === null, sentAt: "t", expiresAt: "t", invitedByName: null, link: `https://app.example/invite/${id}` });
    expect(invitesForClient([inv("i1", "c1"), inv("i2", "c2"), inv("i3", null)], "c1").map((i) => i.id)).toEqual(["i1"]);
  });

  it("withholds invite links from anyone who can't manage the team", () => {
    const inv: OpenInvite = { id: "i1", email: "p@x.com", clientId: "c1", clientName: "Chupps", asOwner: false, sentAt: "t", expiresAt: "t", invitedByName: null, link: "https://app.example/invite/i1" };
    expect(hideInviteLinks([inv])).toEqual([{ ...inv, link: null }]);
  });

  it("trims the people read to an Invite holder's own clients: no other client's invites, names or members", () => {
    const inv = (id: string, clientId: string | null, clientName: string | null): OpenInvite => ({
      id, email: `${id}@x.com`, clientId, clientName, asOwner: clientId === null, sentAt: "t", expiresAt: "t", invitedByName: "Asha", link: `https://app.example/invite/${id}`,
    });
    const onBoth = person({ userId: "d", clientIds: ["c1", "c2"], invitedClient: { id: "c2", name: "Bata" }, permissions: ["generate", "invite"] });
    const invitedToC1 = person({ userId: "e", status: "signed_up", clientIds: ["c1"], invitedClient: { id: "c1", name: "Chupps" } });
    const view = inviteHolderView(
      { people: [owner, onBoth, invitedToC1, elsewhere], invites: [inv("i1", "c1", "Chupps"), inv("i2", "c2", "Bata"), inv("i3", null, null)] },
      ["c1"],
    );
    expect(view.invites).toEqual([{ ...inv("i1", "c1", "Chupps"), link: null }]);
    expect(view.people.map((p) => p.userId)).toEqual(["o", "d", "e", "c"]);
    expect(view.people.every((p) => p.permissions.length === 0)).toBe(true);
    expect(view.people.find((p) => p.userId === "d")).toMatchObject({ clientIds: ["c1"], invitedClient: null });
    expect(view.people.find((p) => p.userId === "e")).toMatchObject({ clientIds: ["c1"], invitedClient: { id: "c1", name: "Chupps" } });
    expect(view.people.find((p) => p.userId === "c")).toMatchObject({ clientIds: [], invitedClient: null });
    expect(JSON.stringify(view)).not.toContain("Bata");
  });
});

describe("peopleReadFor (the people route and the Members page)", () => {
  const inv = (id: string, clientId: string): OpenInvite => ({
    id, email: `${id}@x.com`, clientId, clientName: id, asOwner: false, sentAt: "t", expiresAt: "t", invitedByName: null, link: `https://app.example/invite/${id}`,
  });
  const read = { people: [owner, onC1, elsewhere], invites: [inv("i1", "c1"), inv("i2", "c2")] };

  it("gives the owner the whole read", () => {
    expect(peopleReadFor(read, { canManage: true, access: testOwnerAccess("org-1"), orgId: "org-1" })).toBe(read);
  });

  it("trims it to the clients where an Invite holder holds Invite", () => {
    const access = testAccess({ permissions: ["generate"], clientIds: ["c2"], clients: { c1: ["invite"] } });
    expect(peopleReadFor(read, { canManage: false, access, orgId: "org-1" })).toEqual(inviteHolderView(read, ["c1"]));
  });

  it("fails closed: without manage_team an all-clients answer still trims to nothing", () => {
    expect(peopleReadFor(read, { canManage: false, access: testOwnerAccess("org-1"), orgId: "org-1" })).toEqual(inviteHolderView(read, []));
  });
});

describe("chosenStillEligible (the invite popup's Add)", () => {
  it("keeps only chosen people still offered, whatever the search shows, in list order", () => {
    expect(chosenStillEligible(new Set(["c", "gone", "a"]), [onC1, elsewhere])).toEqual(["a", "c"]);
    expect(chosenStillEligible(new Set(), [onC1])).toEqual([]);
  });
});
