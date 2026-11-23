"use client";

import Link from "next/link";
import { ClientMark } from "@/components/shared/client-mark";
import { useRemoveFromClient } from "@/hooks/queries/people";
import { REMOVE_DETAILS } from "@/lib/people/constants";
import type { ClientBrief } from "@/lib/db/types";
import { RemovePersonDialog } from "./remove-person-dialog";

// One client in the person panel: its mark and name (to its Members list), and Remove, which
// takes the person off this client only, with the same confirmation a Members list asks.
export function PersonPanelClientRow({
  orgId,
  userId,
  personName,
  client,
  href,
}: {
  orgId: string;
  userId: string;
  personName: string;
  client: ClientBrief;
  href: string;
}) {
  const remove = useRemoveFromClient(orgId, client.id);
  return (
    <li className="flex items-center gap-3 border-b border-border/70 py-2.5 last:border-b-0">
      <ClientMark name={client.name} logoUrl={client.logo_url} size="sm" />
      <Link href={href} className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline">
        {client.name}
      </Link>
      <RemovePersonDialog
        name={personName}
        detail={REMOVE_DETAILS.fromClient(client.name)}
        // They stay in the agency, so whatever they made keeps their name.
        showWorkNote={false}
        onConfirm={async () => {
          await remove.mutateAsync(userId);
        }}
      />
    </li>
  );
}
