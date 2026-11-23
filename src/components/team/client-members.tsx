"use client";

import type { ReactNode } from "react";
import { ClientMark } from "@/components/shared/client-mark";
import { usePeople } from "@/hooks/queries/people";
import { invitesForClient, peopleOnClient } from "@/lib/people/utils";
import type { AgencyPeople } from "@/lib/people/types";
import { InviteEntryRow } from "./invite-entry-row";
import { PageHeader } from "@/components/shared/page-header";
import { teamPersonHref } from "@/lib/people/nav";
import { PeopleList } from "./people-list";
import { PersonEntryRow } from "./person-entry-row";
import type { PeopleColumns } from "./person-layout";

// Spec §6.2: who works on this client. Invite, add and remove; permissions are shown but set only
// on the Team page (D547). Rendered on /clients/[id]/members for the owner and Invite holders on
// this client, and in Admin's Clients tab. The rows are the Team page's, without the Clients
// column. An Invite holder's read carries no permissions (inviteHolderView), so for them the
// Permissions column is left out rather than showing everyone as "Can look"; Remove, Resend,
// Cancel and Set permissions are the owner's.
export function ClientMembers({
  orgId,
  client,
  initial,
  teamHref,
  canManage,
  inviteSlot,
  headingLevel = "h2",
  breadcrumb,
}: {
  orgId: string;
  /** slug, when given, rides along on the Team page link so its trail leads back here. */
  client: { id: string; name: string; slug?: string; logo_url?: string | null };
  initial?: AgencyPeople;
  /** Where Set permissions goes. A Server Component can't pass a function, so the Team page's
   *  ?person= target (with this client as ?from=) is the default; Admin passes its own. */
  teamHref?: (userId: string) => string;
  /** The owner or Admin (manage_team). False for an Invite holder. */
  canManage: boolean;
  /** The Invite popup, placed in the header. */
  inviteSlot?: ReactNode;
  /** h1 on the Members page; h2 inside Admin's tab. */
  headingLevel?: "h1" | "h2";
  /** The page's trail, above the header (shown while loading or on an error too). */
  breadcrumb?: ReactNode;
}) {
  const { data, error } = usePeople(orgId, initial);
  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        {breadcrumb}
        {error && <p className="text-sm text-destructive">Couldn&apos;t load the people on this client. Refresh to try again.</p>}
      </div>
    );
  }
  const people = peopleOnClient(data.people, client.id);
  const invites = invitesForClient(data.invites, client.id);
  const count = people.length + invites.length;
  const columns: PeopleColumns = { permissions: canManage, clients: false };
  const viewer = { place: "client", canManage, canMakeOwner: false } as const;
  const setPermissionsHref = teamHref ?? ((userId: string) => teamPersonHref(userId, client.slug));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={breadcrumb}
        leading={<ClientMark name={client.name} logoUrl={client.logo_url ?? null} size="md" />}
        eyebrow="Members"
        title={client.name}
        subtitle={`${count} ${count === 1 ? "person" : "people"} on this client`}
        actions={inviteSlot}
        as={headingLevel}
      />
      <PeopleList columns={columns}>
        {people.map((p) => (
          <PersonEntryRow
            key={p.userId}
            orgId={orgId}
            person={p}
            viewer={viewer}
            columns={columns}
            client={client}
            teamHref={setPermissionsHref}
          />
        ))}
        {invites.map((i) => (
          <InviteEntryRow key={i.id} orgId={orgId} invite={i} columns={columns} canManage={canManage} />
        ))}
      </PeopleList>
    </div>
  );
}
