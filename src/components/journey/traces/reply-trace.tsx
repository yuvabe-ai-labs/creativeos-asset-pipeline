"use client";

import { useState } from "react";
import { ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TurnLine } from "@/lib/journey/kb-copilot/trace";
import { TurnMarks } from "./turn-line";
import { TurnTraceView } from "./turn-trace-view";

/** Under a copilot reply, with the developer switch on: the trace of the turn that wrote it, opened
 *  in place (spec §3.2). */
export function ReplyTrace({ clientId, line }: { clientId: string; line: TurnLine }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="ghost" size="xs" aria-expanded={open} onClick={() => setOpen(!open)} className="text-muted-foreground">
          <ScanSearch strokeWidth={1.5} aria-hidden />
          {open ? "Hide trace" : "Trace"}
        </Button>
        <TurnMarks marks={line.marks} />
      </div>
      {open && <TurnTraceView clientId={clientId} traceId={line.id} />}
    </div>
  );
}
