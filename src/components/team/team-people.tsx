"use client";

import { useMemo, useState } from "react";
import { ClientStack } from "@/components/shared/client-stack";
import { usePeople } from "@/hooks/queries/people";
import { filterTeam, teamCounts, teamEntries, teamEntryKey, teamSummary, type TeamFilter } from "@/lib/people/team-list";
import type { ClientBrief } from "@/lib/db/types";
import type { AgencyPeople } from "@/lib/people/types";
import { InviteEntryRow } from "./invite-entry-row";
import { PeopleList } from "./people-list";
import { PersonEntryRow, type PersonExtra } from "./person-entry-row";
import type { PeopleColumns } from "./person-layout";
import { PersonPanel } from "./person-panel";
import { TeamToolbar } from "./team-toolbar";

const COLUMNS: PeopleColumns = { permissions: true, clients: true };
const membersPage = (c: ClientBrief) => `/clients/${c.slug}/members`;

const EMPTY: Record<TeamFilter["tab"], string> = {
  all: "No one in the team yet.",
  waiting: "Nobody is waiting for permissions.",
  invited: "No open invites.",
  members: "No members yet.",
};

// Spec §6.1: the Team page, the only place permissions are set. One list: people waiting first,
// then open invites, then members with the owner first. A row opens the person panel, where
// permissions are set and the person's clients changed. Rendered on /team for the owner and as
// Admin's People tab (that agency's orgId, with Make owner and reset password there).
// focusUserId (?person=<id>, from a Members list's Set permissions or the signed-up email) opens
// that person's panel.
export function TeamPeople({
  orgId,
  clients,
  initial,
  focusUserId = null,
  canMakeOwner = false,
  extras,
  clientHref = membersPage,
  title,
}: {
  orgId: string;
  /** The agency's clients (id, name, slug, logo), read once with the page. */
  clients: ClientBrief[];
  initial?: AgencyPeople;
  focusUserId?: string | null;
  canMakeOwner?: boolean;
  /** Admin's own actions per person (reset password): on everyone, the owner and people waiting included. */
  extras?: PersonExtra[];
  /** Where a client links to: its Members list, or Admin's Clients tab. */
  clientHref?: (client: ClientBrief) => string;
  /** The page heading ("Team"), shown with the summary line. Admin's tab has its own. */
  title?: string;
}) {
  const { data, error } = usePeople(orgId, initial);
  const [filter, setFilter] = useState<TeamFilter>({ query: "", clientId: null, tab: "all" });
  const [openId, setOpenId] = useState<string | null>(focusUserId);
  // A new ?person target (Admin's Set permissions link) opens that person.
  const [seenFocus, setSeenFocus] = useState(focusUserId);
  if (focusUserId !== seenFocus) {
    setSeenFocus(focusUserId);
    setOpenId(focusUserId);
  }
  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const entries = useMemo(() => (data ? teamEntries(data) : []), [data]);

  if (error && !data) return <p className="text-sm text-destructive">Couldn&apos;t load the team. Refresh to try again.</p>;
  if (!data) return null;

  const counts = teamCounts(entries);
  const shown = filterTeam(entries, filter);
  const filtered = filter.query.trim() !== "" || filter.clientId !== null;
  const openPerson = data.people.find((p) => p.userId === openId) ?? null;
  const viewer = { place: "team", canManage: true, canMakeOwner } as const;
  const clientsOf = (ids: readonly string[]) =>
    ids.map((id) => clientsById.get(id)).filter((c): c is ClientBrief => c !== undefined);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        {title && <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>}
        <p className="text-sm text-muted-foreground">{teamSummary(counts)}</p>
      </div>

      <TeamToolbar filter={filter} onChange={setFilter} clients={clients} counts={counts} />

      <PeopleList
        columns={COLUMNS}
        empty={
          shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{filtered ? "No one matches that search." : EMPTY[filter.tab]}</p>
          ) : undefined
        }
      >
        {shown.map((e) =>
          e.kind === "invite" ? (
            <InviteEntryRow
              key={teamEntryKey(e)}
              orgId={orgId}
              invite={e.invite}
              columns={COLUMNS}
              canManage
              clientsCell={<ClientStack clients={clientsOf(e.invite.clientId ? [e.invite.clientId] : [])} href={clientHref} />}
            />
          ) : (
            <PersonEntryRow
              key={teamEntryKey(e)}
              orgId={orgId}
              person={e.person}
              viewer={viewer}
              columns={COLUMNS}
              clientsCell={<ClientStack clients={clientsOf(e.person.clientIds)} href={clientHref} everyClient={e.person.status === "owner"} />}
              onOpen={() => setOpenId(e.person.userId)}
              extras={extras}
              focused={e.person.userId === focusUserId}
            />
          ),
        )}
      </PeopleList>

      <PersonPanel orgId={orgId} person={openPerson} clients={clients} clientHref={clientHref} onClose={() => setOpenId(null)} />
    </div>
  );
}
