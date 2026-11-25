"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useTurnLines } from "@/hooks/queries/copilot-traces";
import { TurnLineRow } from "./turn-line";
import { TurnTraceView } from "./turn-trace-view";

/** The Turns view (spec §3.2): the client's recent turns, newest first; a line opens its trace. */
export function TurnList({ clientId }: { clientId: string }) {
  const lines = useTurnLines(clientId, true);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-1 p-3">
        {lines.isPending && (
          <div className="flex flex-col gap-2 p-1" aria-label="Loading the turns">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {lines.isError && (
          <div className="flex flex-col items-start gap-2 p-1">
            <p className="text-sm text-muted-foreground">{lines.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => lines.refetch()}>Try again</Button>
          </div>
        )}
        {lines.data?.length === 0 && <p className="p-1 text-sm text-muted-foreground">No turns in the last 30 days.</p>}
        {lines.data?.map((line) => (
          <div key={line.id} className="flex flex-col gap-1">
            <TurnLineRow line={line} open={open === line.id} onToggle={() => setOpen(open === line.id ? null : line.id)} />
            {open === line.id && <TurnTraceView clientId={clientId} traceId={line.id} />}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
