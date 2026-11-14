"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { usePeople } from "@/hooks/queries/people";
import { STATUS_LABELS } from "@/lib/people/constants";
import { invitesForClient, peopleOnClient } from "@/lib/people/utils";
import type { AgencyPeople } from "@/lib/people/types";
import { ClientMemberRow } from "./client-member-row";
import { TeamInvitedRow } from "./team-invited-row";

const teamPageHref = (userId: string) => `/team?person=${userId}`;

// Spec §6.2: who works on this client. Invite, add and remove; permissions are not edited here
// (D509). Rendered on /clients/[id]/members for the owner and Invite holders on this client, and
// in Admin's Clients tab. Remove, Resend, Cancel and Set permissions are the owner's.
export function ClientMembers({
  orgId,
  client,
  initial,
  teamHref = teamPageHref,
  canManage,
  inviteSlot,
}: {
  orgId: string;
  client: { id: string; name: string };
  initial?: AgencyPeople;
  /** Where Set permissions goes. A Server Component can't pass a function, so /team is the
   *  default; Admin passes its own. */
  teamHref?: (userId: string) => string;
  /** The owner or Admin (manage_team). False for an Invite holder. */
  canManage: boolean;
  /** The Invite popup (Task 10), placed in the header. */
  inviteSlot?: ReactNode;
}) {
  const { data, error } = usePeople(orgId, initial);
  if (error && !data) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!data) return null;
  const people = peopleOnClient(data.people, client.id);
  const invites = invitesForClient(data.invites, client.id);
  const count = people.length + invites.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-eyebrow">{count} {count === 1 ? "person" : "people"} on this client</h2>
        {inviteSlot}
      </div>
      <Card className="px-5 py-2 shadow-card">
        <div className="text-eyebrow grid grid-cols-[1fr_auto_auto] gap-4 border-b py-2 text-muted-foreground">
          <span>Name</span><span>Status</span><span className="text-right">Actions</span>
        </div>
        <ul className="flex flex-col">
          {people.map((p) => (
            <ClientMemberRow key={p.userId} orgId={orgId} clientId={client.id} clientName={client.name} person={p} teamHref={teamHref} canManage={canManage} />
          ))}
          {invites.map((i) => (
            <TeamInvitedRow key={i.id} orgId={orgId} invite={i} showClient={false} status={STATUS_LABELS.invited} canManage={canManage} />
          ))}
        </ul>
      </Card>
    </div>
  );
}
