import { describe, it, expect } from "vitest";
import { filterTeam, teamCounts, teamEntries, teamEntryKey, teamSummary, clientsNotOn } from "./team-list";
import type { AgencyPeople, AgencyPerson, OpenInvite } from "./types";

const person = (over: Partial<AgencyPerson>): AgencyPerson => ({
  userId: "u", name: "N", email: "n@x.com", status: "member", permissions: [], joinedAt: "2026-11-10T00:00:00Z",
  invitedByName: null, invitedClient: null, clientIds: [], ...over,
});
const invite = (over: Partial<OpenInvite>): OpenInvite => ({
  id: "i", email: "new@x.com", clientId: "c1", clientName: "Chupps", asOwner: false, sentAt: "t", expiresAt: "t",
  invitedByName: null, link: null, ...over,
});
const data: AgencyPeople = {
  people: [
    person({ userId: "m", name: "Meera", email: "meera@x.com", clientIds: ["c1"] }),
    person({ userId: "o", name: "Asha", email: "asha@x.com", status: "owner" }),
    person({ userId: "w", name: "Ravi", email: "ravi@x.com", status: "signed_up", clientIds: ["c2"] }),
    person({ userId: "k", name: "Kiran", email: "kiran@x.com", clientIds: ["c2"] }),
  ],
  invites: [
    invite({ id: "i1", email: "new@x.com", clientId: "c1" }),
    invite({ id: "i2", email: "boss@x.com", clientId: null, asOwner: true }),
  ],
};
const keys = (entries: ReturnType<typeof teamEntries>) => entries.map(teamEntryKey);

describe("teamEntries", () => {
  it("lists people waiting first, then invites (owner invites left out), then members with the owner first", () => {
    expect(keys(teamEntries(data))).toEqual(["person:w", "invite:i1", "person:o", "person:m", "person:k"]);
  });
});

describe("teamCounts and teamSummary", () => {
  it("counts people, people waiting and open invites", () => {
    const counts = teamCounts(teamEntries(data));
    expect(counts).toEqual({ all: 5, people: 4, waiting: 1, invited: 1, members: 3 });
    expect(teamSummary(counts)).toBe("4 people · 1 waiting · 1 invited");
  });

  it("leaves out the parts that are zero, and says person for one", () => {
    const one = teamCounts(teamEntries({ people: [data.people[1]], invites: [] }));
    expect(teamSummary(one)).toBe("1 person");
  });
});

describe("filterTeam", () => {
  const entries = teamEntries(data);
  const all = { query: "", clientId: null, tab: "all" as const };

  it("returns everything with no filter", () => {
    expect(filterTeam(entries, all)).toHaveLength(5);
  });

  it("searches names and emails, ignoring case and spaces around", () => {
    expect(keys(filterTeam(entries, { ...all, query: "  MEERA " }))).toEqual(["person:m"]);
    expect(keys(filterTeam(entries, { ...all, query: "new@" }))).toEqual(["invite:i1"]);
    expect(filterTeam(entries, { ...all, query: "nobody" })).toEqual([]);
  });

  it("filters by client: people on it, invites to it, and the owner (on every client)", () => {
    expect(keys(filterTeam(entries, { ...all, clientId: "c1" }))).toEqual(["invite:i1", "person:o", "person:m"]);
    expect(keys(filterTeam(entries, { ...all, clientId: "c2" }))).toEqual(["person:w", "person:o", "person:k"]);
  });

  it("splits by tab: Waiting, Invited, Members (the owner included)", () => {
    expect(keys(filterTeam(entries, { ...all, tab: "waiting" }))).toEqual(["person:w"]);
    expect(keys(filterTeam(entries, { ...all, tab: "invited" }))).toEqual(["invite:i1"]);
    expect(keys(filterTeam(entries, { ...all, tab: "members" }))).toEqual(["person:o", "person:m", "person:k"]);
  });

  it("combines search, client and tab", () => {
    expect(keys(filterTeam(entries, { query: "k", clientId: "c2", tab: "members" }))).toEqual(["person:k"]);
  });
});

describe("clientsNotOn", () => {
  it("offers the agency's clients the person is not on yet, in the list's order", () => {
    const clients = [{ id: "c1" }, { id: "c2" }, { id: "c3" }];
    expect(clientsNotOn(clients, ["c2"]).map((c) => c.id)).toEqual(["c1", "c3"]);
  });
});
