"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRemoveFromClient } from "@/hooks/queries/people";
import { STATUS_LABELS } from "@/lib/people/constants";
import type { AgencyPerson } from "@/lib/people/types";
import { RemovePersonDialog } from "./remove-person-dialog";

// One person on a client's Members list: Name, Status, Actions (spec §6.2). Remove takes them off
// this client only; permissions are set on the Team page. Set permissions and Remove are the
// owner's (canManage); an Invite holder sees the status only.
export function ClientMemberRow({ orgId, clientId, clientName, person, teamHref, canManage }: {
  orgId: string;
  clientId: string;
  clientName: string;
  person: AgencyPerson;
  teamHref: (userId: string) => string;
  canManage: boolean;
}) {
  const remove = useRemoveFromClient(orgId, clientId);
  return (
    <li className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b py-3 text-sm last:border-b-0">
      <div className="flex min-w-0 flex-col">
        <span className="font-medium">{person.name}</span>
        <span className="truncate text-xs text-muted-foreground">{person.email}</span>
      </div>
      <span className="text-muted-foreground">{STATUS_LABELS[person.status]}</span>
      <div className="flex items-center justify-end gap-2">
        {canManage && person.status === "signed_up" && (
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={teamHref(person.userId)} />}>
            Set permissions
          </Button>
        )}
        {canManage && person.status !== "owner" && (
          <RemovePersonDialog
            name={person.name}
            detail={`They come off ${clientName} only. They stay in the agency with their other clients and permissions.`}
            onConfirm={async () => {
              await remove.mutateAsync(person.userId);
            }}
          />
        )}
      </div>
    </li>
  );
}
