"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useUpdatePermissions } from "@/hooks/queries/people";
import { orderedPermissions, type Permission } from "@/lib/permissions/model";
import type { AgencyPerson } from "@/lib/people/types";
import { PermissionEditor } from "./permission-editor";
import { PermissionSummary } from "./permission-summary";

const same = (a: readonly Permission[], b: readonly Permission[]) =>
  orderedPermissions(a).join() === orderedPermissions(b).join();

// The person panel's Permissions (D509: the only place they are set). Someone waiting starts with
// none and gets Give access, which works with none picked (they can then look but not change
// anything); a member edits their set and saves. Either way the agency level changes and the
// cascade applies it to every client they are on. The owner holds everything; nothing to edit.
// Keyed by person and status by its parent, so the draft starts fresh when either changes.
export function PersonPanelAccess({ orgId, person }: { orgId: string; person: AgencyPerson }) {
  const waiting = person.status === "signed_up";
  const [draft, setDraft] = useState<Permission[]>(waiting ? [] : person.permissions);
  const update = useUpdatePermissions(orgId);

  if (person.status === "owner") {
    return (
      <div className="flex flex-col gap-2">
        <PermissionSummary permissions={[]} owner />
        <p className="text-xs text-muted-foreground">The owner can do everything on every client.</p>
      </div>
    );
  }

  const changed = !same(draft, person.permissions);
  return (
    <div className="flex flex-col gap-3">
      <PermissionEditor value={draft} onChange={setDraft} personName={person.name} disabled={update.isPending} />
      {update.error && <p className="text-sm text-destructive">{update.error.message}</p>}
      <div className="flex items-center gap-2">
        {waiting ? (
          <Button disabled={update.isPending} onClick={() => update.mutate({ userId: person.userId, permissions: draft, giveAccess: true })}>
            {update.isPending ? "Giving access…" : "Give access"}
          </Button>
        ) : (
          <>
            <Button disabled={!changed || update.isPending} onClick={() => update.mutate({ userId: person.userId, permissions: draft })}>
              {update.isPending ? "Saving…" : "Save"}
            </Button>
            <Button variant="outline" disabled={!changed || update.isPending} onClick={() => setDraft(person.permissions)}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
