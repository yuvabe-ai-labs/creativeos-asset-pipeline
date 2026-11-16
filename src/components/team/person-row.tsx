"use client";

import type { MouseEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/shared/person-avatar";
import { cn } from "@/lib/utils";
import { PEOPLE_SUBGRID, PERSON_HIGHLIGHT, peopleSpan, type PeopleColumns } from "./person-layout";

// One row of a people list, a person or an open invite, on the Team page and every Members list:
// Person (avatar, name, email) | Status | Permissions | Clients | Actions. Each cell is a
// direct child, so from sm up the row is a subgrid of the list and the columns line up. On a
// phone it is two lines: who and the actions, then status, permissions and clients.
export function PersonRow({
  columns,
  name,
  detail,
  owner = false,
  invited = false,
  status,
  permissions,
  clients,
  actions,
  below,
  focused = false,
  anchorId,
  onOpen,
}: {
  columns: PeopleColumns;
  /** The person's name, or an invite's email. */
  name: string;
  /** Under the name: the email, or an invite's who-and-when. */
  detail: string;
  owner?: boolean;
  invited?: boolean;
  status: ReactNode;
  permissions?: ReactNode;
  clients?: ReactNode;
  actions: ReactNode;
  /** Notices and links that span the row (an invite's link to copy). */
  below?: ReactNode;
  focused?: boolean;
  anchorId?: string;
  /** Opens the person panel (Team page). The name is its button; a click anywhere else on the
   *  row that isn't on a control does the same. */
  onOpen?: () => void;
}) {
  const who = (
    <>
      <PersonAvatar name={name} owner={owner} invited={invited} />
      <span className="flex min-w-0 flex-col text-left">
        <span className="truncate font-medium text-foreground">{name}</span>
        <span className="truncate text-xs font-normal text-muted-foreground">{detail}</span>
      </span>
    </>
  );

  function openFromRow(e: MouseEvent<HTMLLIElement>) {
    if (!onOpen) return;
    const target = e.target as HTMLElement;
    // Menus and dialogs are portalled out of the row but still bubble through React; a click
    // inside them, or on any control in the row, is not a click on the row.
    if (!e.currentTarget.contains(target) || target.closest("button, a, [role=menuitem]")) return;
    onOpen();
  }

  return (
    <li
      id={anchorId}
      onClick={onOpen ? openFromRow : undefined}
      className={cn(
        "-mx-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border-b border-border/70 px-3 py-3 text-sm transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] last:border-b-0",
        PEOPLE_SUBGRID,
        peopleSpan(columns),
        onOpen && "cursor-pointer hover:bg-muted/40",
        focused && PERSON_HIGHLIGHT,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 max-sm:order-1">
        {onOpen ? (
          <Button
            variant="ghost"
            className="h-auto min-w-0 justify-start gap-3 p-0 font-normal hover:bg-transparent"
            onClick={onOpen}
            aria-label={`Open ${name}`}
          >
            {who}
          </Button>
        ) : (
          who
        )}
      </div>
      <div className="max-sm:order-4 max-sm:ml-11">{status}</div>
      {columns.permissions && <div className="min-w-0 max-sm:order-5">{permissions}</div>}
      {columns.clients && <div className="max-sm:order-6">{clients}</div>}
      <div className="max-sm:order-2">{actions}</div>
      {/* Phone only: ends the first line, so status and the rest start the second. */}
      <span aria-hidden className="h-0 basis-full max-sm:order-3 sm:hidden" />
      {below && <div className={cn("flex w-full flex-col gap-1.5 max-sm:order-7 max-sm:pl-11 sm:pl-11", peopleSpan(columns))}>{below}</div>}
    </li>
  );
}
