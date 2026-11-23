import type { AgencyPeople, AgencyPerson, OpenInvite } from "./types";

/** One row of the Team page's list: a person, or an open invite. */
export type TeamEntry = { kind: "person"; person: AgencyPerson } | { kind: "invite"; invite: OpenInvite };

export const TEAM_TABS = ["all", "waiting", "invited", "members"] as const;
export type TeamTab = (typeof TEAM_TABS)[number];

export type TeamFilter = { query: string; clientId: string | null; tab: TeamTab };

export type TeamCounts = { all: number; people: number; waiting: number; invited: number; members: number };

export const teamEntryKey = (e: TeamEntry) => (e.kind === "person" ? `person:${e.person.userId}` : `invite:${e.invite.id}`);

/** Spec §6.1: one list. People waiting first, then open invites (an owner invite is Admin's, not
 *  the team's), then members with the owner first, the rest in the order the read gives them. */
export function teamEntries(read: AgencyPeople): TeamEntry[] {
  const waiting = read.people.filter((p) => p.status === "signed_up");
  const members = read.people
    .filter((p) => p.status !== "signed_up")
    .sort((a, b) => Number(b.status === "owner") - Number(a.status === "owner"));
  return [
    ...waiting.map((person) => ({ kind: "person" as const, person })),
    ...read.invites.filter((i) => !i.asOwner).map((invite) => ({ kind: "invite" as const, invite })),
    ...members.map((person) => ({ kind: "person" as const, person })),
  ];
}

function tabOf(e: TeamEntry): Exclude<TeamTab, "all"> {
  if (e.kind === "invite") return "invited";
  return e.person.status === "signed_up" ? "waiting" : "members";
}

export function teamCounts(entries: readonly TeamEntry[]): TeamCounts {
  const counts: TeamCounts = { all: entries.length, people: 0, waiting: 0, invited: 0, members: 0 };
  for (const e of entries) {
    counts[tabOf(e)] += 1;
    if (e.kind === "person") counts.people += 1;
  }
  return counts;
}

/** The line under the Team heading: "5 people · 1 waiting · 1 invited", zero parts left out. */
export function teamSummary(c: TeamCounts): string {
  return [
    `${c.people} ${c.people === 1 ? "person" : "people"}`,
    c.waiting > 0 ? `${c.waiting} waiting` : null,
    c.invited > 0 ? `${c.invited} invited` : null,
  ].filter(Boolean).join(" · ");
}

function matchesQuery(e: TeamEntry, q: string): boolean {
  if (!q) return true;
  if (e.kind === "invite") return e.invite.email.toLowerCase().includes(q);
  return e.person.name.toLowerCase().includes(q) || e.person.email.toLowerCase().includes(q);
}

function onClient(e: TeamEntry, clientId: string | null): boolean {
  if (!clientId) return true;
  if (e.kind === "invite") return e.invite.clientId === clientId;
  // The owner is on every client.
  return e.person.status === "owner" || e.person.clientIds.includes(clientId);
}

/** The Team page's search, client filter and tabs, applied together. */
export function filterTeam(entries: readonly TeamEntry[], { query, clientId, tab }: TeamFilter): TeamEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => (tab === "all" || tabOf(e) === tab) && onClient(e, clientId) && matchesQuery(e, q));
}

/** The person panel's "Add to a client": the agency's clients the person is not on yet. */
export function clientsNotOn<C extends { id: string }>(clients: readonly C[], clientIds: readonly string[]): C[] {
  const on = new Set(clientIds);
  return clients.filter((c) => !on.has(c.id));
}
