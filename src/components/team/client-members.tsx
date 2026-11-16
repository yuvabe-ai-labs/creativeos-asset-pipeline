"use client";

import type { ReactNode } from "react";
import { ClientMark } from "@/components/shared/client-mark";
import { usePeople } from "@/hooks/queries/people";
import { invitesForClient, peopleOnClient } from "@/lib/people/utils";
import type { AgencyPeople } from "@/lib/people/types";
import { InviteEntryRow } from "./invite-entry-row";
import { PeopleList } from "./people-list";
import { PersonEntryRow } from "./person-entry-row";
import type { PeopleColumns } from "./person-layout";

const teamPageHref = (userId: string) => `/team?person=${userId}`;

// Spec §6.2: who works on this client. Invite, add and remove; permissions are shown but set only
// on the Team page (D509). Rendered on /clients/[id]/members for the owner and Invite holders on
// this client, and in Admin's Clients tab. The rows are the Team page's, without the Clients
// column. An Invite holder's read carries no permissions (inviteHolderView), so for them the
// Permissions column is left out rather than showing everyone as "Can look"; Remove, Resend,
// Cancel and Set permissions are the owner's.
export function ClientMembers({
  orgId,
  client,
  initial,
  teamHref = teamPageHref,
  canManage,
  inviteSlot,
  headingLevel = "h2",
}: {
  orgId: string;
  client: { id: string; name: string; logo_url?: string | null };
  initial?: AgencyPeople;
  /** Where Set permissions goes (the Team page's ?person= target). A Server Component can't pass
   *  a function, so /team is the default; Admin passes its own. */
  teamHref?: (userId: string) => string;
  /** The owner or Admin (manage_team). False for an Invite holder. */
  canManage: boolean;
  /** The Invite popup, placed in the header. */
  inviteSlot?: ReactNode;
  /** h1 on the Members page; h2 inside Admin's tab. */
  headingLevel?: "h1" | "h2";
}) {
  const { data, error } = usePeople(orgId, initial);
  if (error && !data) return <p className="text-sm text-destructive">Couldn&apos;t load the people on this client. Refresh to try again.</p>;
  if (!data) return null;
  const people = peopleOnClient(data.people, client.id);
  const invites = invitesForClient(data.invites, client.id);
  const count = people.length + invites.length;
  const columns: PeopleColumns = { permissions: canManage, clients: false };
  const viewer = { place: "client", canManage, canMakeOwner: false } as const;
  const Heading = headingLevel;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <ClientMark name={client.name} logoUrl={client.logo_url ?? null} size="md" />
          <div className="flex min-w-0 flex-col">
            <span className="text-eyebrow text-[0.65rem] text-muted-foreground">Members</span>
            <Heading className="font-display truncate text-2xl font-semibold tracking-tight">{client.name}</Heading>
            <p className="text-sm text-muted-foreground">{`${count} ${count === 1 ? "person" : "people"} on this client`}</p>
          </div>
        </div>
        {inviteSlot}
      </div>
      <PeopleList columns={columns}>
        {people.map((p) => (
          <PersonEntryRow
            key={p.userId}
            orgId={orgId}
            person={p}
            viewer={viewer}
            columns={columns}
            client={client}
            teamHref={teamHref}
          />
        ))}
        {invites.map((i) => (
          <InviteEntryRow key={i.id} orgId={orgId} invite={i} columns={columns} canManage={canManage} />
        ))}
      </PeopleList>
    </div>
  );
}
