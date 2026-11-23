"use client";

import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { ClientBrief } from "@/lib/db/types";
import type { AgencyPerson } from "@/lib/people/types";
import { PersonPanelBody } from "./person-panel-body";

// The Team page's person panel: a sheet from the right, opened by a row, its Set or Edit
// permissions, or ?person=<id>. It closes on its own once the person is gone (removed).
export function PersonPanel({
  orgId,
  person,
  clients,
  clientHref,
  onClose,
}: {
  orgId: string;
  person: AgencyPerson | null;
  clients: readonly ClientBrief[];
  clientHref: (client: ClientBrief) => string;
  onClose: () => void;
}) {
  // Keep the last person on screen while the sheet slides out.
  const [last, setLast] = useState(person);
  if (person && person !== last) setLast(person);
  const shown = person ?? last;
  return (
    <Sheet open={person !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" aria-label={shown?.name ?? "Person"} className="w-full overflow-y-auto p-6 sm:max-w-md data-[side=right]:sm:max-w-md">
        {shown && <PersonPanelBody orgId={orgId} person={shown} clients={clients} clientHref={clientHref} />}
      </SheetContent>
    </Sheet>
  );
}
