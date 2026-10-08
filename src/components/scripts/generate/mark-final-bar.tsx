"use client";

import { CheckCircle2, Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { OpenItem } from "@/lib/scripts/copilot/schema";

/** Spec 2 §10 — "Mark final … is available only when the fill-to-final list (§8) is empty." */
export function MarkFinalBar({ openItems, canUndo, onUndo, onMarkFinal, pending, disabled }: {
  openItems: OpenItem[];
  canUndo: boolean;
  onUndo: () => void;
  onMarkFinal: () => void;
  pending: boolean;
  disabled: boolean;
}) {
  const blocked = openItems.length > 0;
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <Button variant="ghost" size="sm" disabled={!canUndo} onClick={onUndo}>
        <Undo2 strokeWidth={1.5} /> Undo
      </Button>
      <span className="text-sm text-muted-foreground" aria-live="polite">
        {blocked ? `${openItems.length} to settle before it's final` : "Ready for the client to read"}
      </span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={<span className="inline-block" />}>
            <Button disabled={blocked || disabled || pending} onClick={onMarkFinal}>
              {pending ? <Loader2 className="animate-spin" strokeWidth={1.5} /> : <CheckCircle2 strokeWidth={1.5} />}
              Mark final
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {blocked ? "Final means ready for the client to read. Settle what the notes list as still open." : "Moves the script to Visualise."}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
