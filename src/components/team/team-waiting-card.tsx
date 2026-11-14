"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRemovePerson, useUpdatePermissions } from "@/hooks/queries/people";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { Permission } from "@/lib/permissions/model";
import type { AgencyPerson } from "@/lib/people/types";
import { PermissionEditor } from "./permission-editor";
import { RemovePersonDialog } from "./remove-person-dialog";

// Spec §6.1 "Waiting for you": someone who signed up. Give access saves the permissions and lets
// them in; the cascade fills the client rows they already have, and they are emailed. Give access
// works with none picked: they can then look but not change anything.
export function TeamWaitingCard({
  orgId,
  person,
  clientNames,
  focused,
}: {
  orgId: string;
  person: AgencyPerson;
  clientNames: ReadonlyMap<string, string>;
  focused: boolean;
}) {
  const [draft, setDraft] = useState<Permission[]>([]);
  const update = useUpdatePermissions(orgId);
  const remove = useRemovePerson(orgId);
  const clients = person.clientIds.map((id) => clientNames.get(id)).filter(Boolean).join(", ");
  const invited = person.invitedClient
    ? ` · invited to ${person.invitedClient.name}${person.invitedByName ? ` by ${person.invitedByName}` : ""}`
    : "";

  return (
    <Card id={`person-${person.userId}`} className={`flex flex-col gap-4 p-5 shadow-card ${focused ? "ring-2 ring-primary/40" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{person.name}</span>
          <span className="text-sm text-muted-foreground">{person.email}</span>
          <span className="text-xs text-muted-foreground">
            Signed up {formatRelativeTime(person.joinedAt)}{invited}
          </span>
          {clients && <span className="mt-1 text-xs text-muted-foreground">Clients: {clients}</span>}
        </div>
        <RemovePersonDialog
          name={person.name}
          detail="They haven't started yet. Their login is deleted and the invite link stops working."
          onConfirm={() => remove.mutateAsync(person.userId)}
        />
      </div>
      <PermissionEditor value={draft} onChange={setDraft} personName={person.name} disabled={update.isPending} />
      {update.error && <p className="text-sm text-destructive">{update.error.message}</p>}
      <div>
        <Button disabled={update.isPending} onClick={() => update.mutate({ userId: person.userId, permissions: draft, giveAccess: true })}>
          {update.isPending ? "Giving access…" : "Give access"}
        </Button>
      </div>
    </Card>
  );
}
