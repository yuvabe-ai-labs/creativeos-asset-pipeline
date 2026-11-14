import { describe, it, expect } from "vitest";
import { hideInviteLinks, invitesForClient, isValidEmail, normaliseEmail, oneDayAgo, peopleNotOnClient, peopleOnClient, signedUpPeople } from "./utils";
import type { AgencyPerson, OpenInvite } from "./types";

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
    const inv = (id: string, clientId: string | null): OpenInvite => ({ id, email: `${id}@x.com`, clientId, clientName: null, asOwner: clientId === null, sentAt: "t", expiresAt: "t", link: `https://app.example/invite/${id}` });
    expect(invitesForClient([inv("i1", "c1"), inv("i2", "c2"), inv("i3", null)], "c1").map((i) => i.id)).toEqual(["i1"]);
  });

  it("withholds invite links from anyone who can't manage the team", () => {
    const inv: OpenInvite = { id: "i1", email: "p@x.com", clientId: "c1", clientName: "Chupps", asOwner: false, sentAt: "t", expiresAt: "t", link: "https://app.example/invite/i1" };
    expect(hideInviteLinks([inv])).toEqual([{ ...inv, link: null }]);
  });

  it("is a day before now", () => {
    expect(oneDayAgo(new Date("2026-11-13T12:00:00.000Z"))).toBe("2026-11-12T12:00:00.000Z");
  });
});
