"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { usePeople } from "@/hooks/queries/people";
import { signedUpPeople } from "@/lib/people/utils";
import type { AgencyPeople, AgencyPerson } from "@/lib/people/types";
import { personAnchorId } from "./person-layout";
import { TeamWaitingCard } from "./team-waiting-card";
import { TeamInvitedList } from "./team-invited-list";
import { TeamMemberRow } from "./team-member-row";

// Spec §6.1: the Team page, the only place permissions are set. Rendered on /team for the owner
// and as Admin's People tab (orgId of that agency, with Make owner and reset password there).
// focusUserId (?person=<id>, from a Members list's Set permissions or the signed-up email) is
// highlighted and scrolled into view once the people are on screen.
export function TeamPeople({
  orgId,
  clients,
  initial,
  focusUserId = null,
  canMakeOwner = false,
  extraMemberActions,
}: {
  orgId: string;
  clients: { id: string; name: string }[];
  initial?: AgencyPeople;
  focusUserId?: string | null;
  canMakeOwner?: boolean;
  /** Admin's own actions per person (reset password): on members, the owner and people waiting. */
  extraMemberActions?: (person: AgencyPerson) => ReactNode;
}) {
  const { data, error } = usePeople(orgId, initial);
  const clientNames = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const scrolledTo = useRef<string | null>(null);
  const loaded = data !== undefined;

  useEffect(() => {
    if (!focusUserId || !loaded || scrolledTo.current === focusUserId) return;
    const target = document.getElementById(personAnchorId(focusUserId));
    if (!target) return;
    scrolledTo.current = focusUserId;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusUserId, loaded]);

  if (error && !data) return <p className="text-sm text-destructive">Couldn&apos;t load the team. Refresh to try again.</p>;
  if (!data) return null;

  const waiting = signedUpPeople(data.people);
  // Owner first (spec §6.1), the rest in the order the read gives them.
  const members = data.people
    .filter((p) => p.status !== "signed_up")
    .sort((a, b) => Number(b.status === "owner") - Number(a.status === "owner"));
  const invites = data.invites.filter((i) => !i.asOwner);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h2 className="text-eyebrow">Waiting for you</h2>
        {waiting.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is waiting for permissions.</p>
        ) : (
          waiting.map((p) => (
            <TeamWaitingCard
              key={p.userId}
              orgId={orgId}
              person={p}
              clientNames={clientNames}
              focused={p.userId === focusUserId}
              extraActions={extraMemberActions?.(p)}
            />
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-eyebrow">Invited</h2>
        <Card className="px-5 py-2 shadow-card"><TeamInvitedList orgId={orgId} invites={invites} /></Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-eyebrow">Members</h2>
        <Card className="px-5 py-2 shadow-card">
          <ul className="flex flex-col">
            {members.map((p) => (
              <TeamMemberRow
                key={p.userId}
                orgId={orgId}
                person={p}
                clientNames={clientNames}
                canMakeOwner={canMakeOwner}
                extraActions={extraMemberActions?.(p)}
                focused={p.userId === focusUserId}
              />
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
