"use client";

import { PersonAvatar } from "@/components/shared/person-avatar";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { clientsNotOn } from "@/lib/people/team-list";
import type { ClientBrief } from "@/lib/db/types";
import type { AgencyPerson } from "@/lib/people/types";
import { AddToClient } from "./add-to-client";
import { PersonPanelAccess } from "./person-panel-access";
import { PersonPanelClientRow } from "./person-panel-client-row";
import { StatusBadge } from "./status-badge";

/** "Invited to Chupps by Asha · Signed up 2d ago", from what the people read knows. */
export function personHistory(person: AgencyPerson): string | null {
  if (person.status === "owner") return null;
  const invited = person.invitedClient
    ? `Invited to ${person.invitedClient.name}${person.invitedByName ? ` by ${person.invitedByName}` : ""}`
    : person.invitedByName
      ? `Invited by ${person.invitedByName}`
      : null;
  const joined = `${person.status === "signed_up" ? "Signed up" : "Joined"} ${formatRelativeTime(person.joinedAt)}`;
  return [invited, joined].filter(Boolean).join(" · ");
}

// What the person panel shows (spec §6.1): who they are, their permissions (set here and nowhere
// else, D547), and the clients they are on, with Remove from a client and Add to a client.
export function PersonPanelBody({
  orgId,
  person,
  clients,
  clientHref,
}: {
  orgId: string;
  person: AgencyPerson;
  /** The agency's clients, read once for the page. */
  clients: readonly ClientBrief[];
  clientHref: (client: ClientBrief) => string;
}) {
  const isOwner = person.status === "owner";
  const byId = new Map(clients.map((c) => [c.id, c]));
  const on = person.clientIds.map((id) => byId.get(id)).filter((c): c is ClientBrief => c !== undefined);
  const history = personHistory(person);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-start gap-4 pr-8">
        <PersonAvatar name={person.name} size="md" owner={isOwner} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="font-display truncate text-xl font-semibold tracking-tight">{person.name}</h2>
          <span className="truncate text-sm text-muted-foreground">{person.email}</span>
          <StatusBadge status={person.status} />
          {history && <span className="text-xs text-muted-foreground">{history}</span>}
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h3 className="text-eyebrow">Permissions</h3>
        <PersonPanelAccess key={`${person.userId}:${person.status}`} orgId={orgId} person={person} />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-eyebrow">Clients</h3>
        {isOwner ? (
          <p className="text-sm text-muted-foreground">The owner is on every client.</p>
        ) : (
          <>
            {on.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not on any client yet.</p>
            ) : (
              <ul className="flex flex-col">
                {on.map((c) => (
                  <PersonPanelClientRow key={c.id} orgId={orgId} userId={person.userId} personName={person.name} client={c} href={clientHref(c)} />
                ))}
              </ul>
            )}
            <AddToClient key={person.userId} orgId={orgId} userId={person.userId} options={clientsNotOn(clients, person.clientIds)} />
          </>
        )}
      </section>
    </div>
  );
}
