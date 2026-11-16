"use client";

import Link from "next/link";
import { Fragment, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useMakeOwner, useRemoveFromClient, useRemovePerson } from "@/hooks/queries/people";
import { personActions, type PersonActionId, type PersonViewer } from "@/lib/people/actions";
import { REMOVE_DETAILS } from "@/lib/people/constants";
import type { AgencyPerson } from "@/lib/people/types";
import { MakeOwnerDialog } from "./make-owner-dialog";
import { PermissionSummary } from "./permission-summary";
import { personAnchorId, type PeopleColumns } from "./person-layout";
import { PersonRow } from "./person-row";
import { RemovePersonDialog } from "./remove-person-dialog";
import { RowActions, type RowMenuItem } from "./row-actions";
import { StatusBadge } from "./status-badge";

/** Admin's own per-person actions (reset password): a menu item that opens its own dialog. */
export type PersonExtra = {
  id: string;
  label: string;
  render: (person: AgencyPerson, dialog: { open: boolean; onOpenChange: (open: boolean) => void }) => ReactNode;
};

const LABELS: Record<PersonActionId, string> = {
  set_permissions: "Set permissions",
  edit_permissions: "Edit permissions",
  make_owner: "Make owner",
  remove_from_client: "Remove from client",
  remove_from_agency: "Remove from agency",
};

// A person on the Team page or a client's Members list. Permissions are set in the Team page's
// person panel only (D509): there, Set and Edit open it (`onOpen`); on a Members list they link
// to it (`teamHref`). Removals and Make owner ask first, in the existing dialogs.
export function PersonEntryRow({
  orgId,
  person,
  viewer,
  columns,
  client,
  clientsCell,
  onOpen,
  teamHref,
  extras = [],
  focused = false,
}: {
  orgId: string;
  person: AgencyPerson;
  viewer: PersonViewer;
  columns: PeopleColumns;
  /** The client of a Members list (Remove from client). */
  client?: { id: string; name: string };
  clientsCell?: ReactNode;
  onOpen?: () => void;
  teamHref?: (userId: string) => string;
  extras?: PersonExtra[];
  focused?: boolean;
}) {
  const [dialog, setDialog] = useState<string | null>(null);
  const removePerson = useRemovePerson(orgId);
  const removeFromClient = useRemoveFromClient(orgId, client?.id ?? "");
  const makeOwner = useMakeOwner(orgId);
  const { primary, menu } = personActions(person, viewer);
  const isOwner = person.status === "owner";
  const dialogProps = (id: string) => ({ open: dialog === id, onOpenChange: (open: boolean) => setDialog(open ? id : null) });

  // Set and Edit permissions: the panel on the Team page, a link to it from a Members list.
  const toPanel = (key: PersonActionId): RowMenuItem =>
    onOpen
      ? { key, label: LABELS[key], onSelect: onOpen }
      : { key, label: LABELS[key], href: teamHref?.(person.userId) ?? `/team?person=${person.userId}` };
  const items: RowMenuItem[] = [
    ...menu.map((key): RowMenuItem => {
      if (key === "edit_permissions") return toPanel(key);
      const destructive = key === "remove_from_agency" || key === "remove_from_client";
      return { key, label: LABELS[key], destructive, onSelect: () => setDialog(key) };
    }),
    ...extras.map((x): RowMenuItem => ({ key: x.id, label: x.label, onSelect: () => setDialog(x.id) })),
  ];

  const primaryButton =
    primary === "set_permissions" &&
    (onOpen ? (
      <Button size="sm" variant="outline-primary" onClick={onOpen}>{LABELS.set_permissions}</Button>
    ) : (
      <Button size="sm" variant="outline-primary" nativeButton={false} render={<Link href={teamHref?.(person.userId) ?? `/team?person=${person.userId}`} />}>
        {LABELS.set_permissions}
      </Button>
    ));

  const dialogs = (
    <>
      {menu.includes("remove_from_agency") && (
        <RemovePersonDialog
          {...dialogProps("remove_from_agency")}
          name={person.name}
          detail={person.status === "signed_up" ? REMOVE_DETAILS.waiting : REMOVE_DETAILS.fromAgency}
          // Someone still waiting made nothing, so there is no work to speak of.
          showWorkNote={person.status !== "signed_up"}
          onConfirm={() => removePerson.mutateAsync(person.userId)}
        />
      )}
      {menu.includes("remove_from_client") && client && (
        <RemovePersonDialog
          {...dialogProps("remove_from_client")}
          name={person.name}
          detail={REMOVE_DETAILS.fromClient(client.name)}
          // They stay in the agency, so whatever they made keeps their name.
          showWorkNote={false}
          onConfirm={() => removeFromClient.mutateAsync(person.userId)}
        />
      )}
      {menu.includes("make_owner") && (
        <MakeOwnerDialog {...dialogProps("make_owner")} name={person.name} onConfirm={() => makeOwner.mutateAsync(person.userId)} />
      )}
      {extras.map((x) => <Fragment key={x.id}>{x.render(person, dialogProps(x.id))}</Fragment>)}
    </>
  );

  return (
    <PersonRow
      columns={columns}
      name={person.name}
      detail={person.email}
      owner={isOwner}
      status={<StatusBadge status={person.status} />}
      permissions={<PermissionSummary permissions={person.permissions} owner={isOwner} />}
      clients={clientsCell}
      actions={
        <>
          <RowActions primary={primaryButton || undefined} items={items} label={`More actions for ${person.name}`} />
          {/* The dialogs render nothing in place until opened (they portal). */}
          {dialogs}
        </>
      }
      focused={focused}
      anchorId={personAnchorId(person.userId)}
      onOpen={onOpen}
    />
  );
}
