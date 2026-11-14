"use client";

import type { OpenInvite } from "@/lib/people/types";
import { TeamInvitedRow } from "./team-invited-row";

export function TeamInvitedList({ orgId, invites }: { orgId: string; invites: OpenInvite[] }) {
  if (invites.length === 0) return <p className="py-3 text-sm text-muted-foreground">No open invites.</p>;
  return (
    <ul className="flex flex-col">
      {invites.map((i) => <TeamInvitedRow key={i.id} orgId={orgId} invite={i} />)}
    </ul>
  );
}
