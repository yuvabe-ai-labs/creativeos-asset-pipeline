"use client";

import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMakeOwner, useRemovePerson, useUpdatePermissions } from "@/hooks/queries/people";
import { NO_PERMISSIONS_LABEL, PERMISSION_LABELS, STATUS_LABELS } from "@/lib/people/constants";
import { orderedPermissions, type Permission } from "@/lib/permissions/model";
import type { AgencyPerson } from "@/lib/people/types";
import { PermissionEditor } from "./permission-editor";
import { MakeOwnerDialog } from "./make-owner-dialog";
import { RemovePersonDialog } from "./remove-person-dialog";

// Spec §6.1 "Members". The owner has no actions. Edit opens the same editor; saving changes the
// agency level and the cascade applies it to every client they are on. A member with no
// permissions shows "Can look".
export function TeamMemberRow({
  orgId,
  person,
  clientNames,
  canMakeOwner,
  extraActions,
  focused,
}: {
  orgId: string;
  person: AgencyPerson;
  clientNames: ReadonlyMap<string, string>;
  canMakeOwner: boolean;
  extraActions?: ReactNode;
  focused: boolean;
}) {
  const [editing, setEditing] = useState<Permission[] | null>(null);
  const update = useUpdatePermissions(orgId);
  const remove = useRemovePerson(orgId);
  const makeOwner = useMakeOwner(orgId);
  const isOwner = person.status === "owner";
  const clients = person.clientIds.map((id) => clientNames.get(id)).filter(Boolean).join(", ");

  async function save() {
    if (!editing) return;
    try {
      await update.mutateAsync({ userId: person.userId, permissions: editing });
      setEditing(null);
    } catch {
      // Shown below through update.error; the editor stays open.
    }
  }

  return (
    <li id={`person-${person.userId}`} className={`flex flex-col gap-3 border-b py-3 last:border-b-0 ${focused ? "rounded-lg bg-primary/5 px-2" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium">{person.name}</span>
          <span className="text-xs text-muted-foreground">{person.email}</span>
          {isOwner ? (
            <span className="text-xs text-muted-foreground">{STATUS_LABELS.owner} · every permission on every client</span>
          ) : (
            <>
              <span className="flex flex-wrap gap-1">
                {person.permissions.length === 0 ? (
                  <Badge variant="outline" className="text-muted-foreground">{NO_PERMISSIONS_LABEL}</Badge>
                ) : (
                  orderedPermissions(person.permissions).map((p) => (
                    <Badge key={p} variant="outline">{PERMISSION_LABELS[p]}</Badge>
                  ))
                )}
              </span>
              {clients && <span className="text-xs text-muted-foreground">Clients: {clients}</span>}
            </>
          )}
        </div>
        {!isOwner && (
          <div className="flex items-center gap-2">
            {canMakeOwner && (
              <MakeOwnerDialog name={person.name} onConfirm={() => makeOwner.mutateAsync(person.userId)} />
            )}
            {extraActions}
            {editing === null && <Button size="sm" variant="outline" onClick={() => setEditing(person.permissions)}>Edit</Button>}
            <RemovePersonDialog
              name={person.name}
              detail="They lose access to every client of this agency at once, and their login is deleted."
              onConfirm={() => remove.mutateAsync(person.userId)}
            />
          </div>
        )}
      </div>
      {editing !== null && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <PermissionEditor value={editing} onChange={setEditing} personName={person.name} disabled={update.isPending} />
          <div className="flex gap-2">
            <Button size="sm" disabled={update.isPending} onClick={() => void save()}>{update.isPending ? "Saving…" : "Save"}</Button>
            <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      )}
      {update.error && <p className="text-sm text-destructive">{update.error.message}</p>}
    </li>
  );
}
