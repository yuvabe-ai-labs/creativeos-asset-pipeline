"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { OpenItem } from "@/lib/scripts/copilot/schema";

/** How an open item reads in the confirm: a confirmation by what to confirm, anything else by its label. */
export function openItemNames(items: OpenItem[]): string[] {
  return items.map((i) => (i.id.startsWith("confirm.") ? i.question : i.label));
}

const SHOWN = 4;

/** Spec 2 §10, as D363 revises it: Mark final is there once a draft exists. While anything is still
 *  open (§8) it asks first, naming what is open; the items stay in the notes either way. */
export function MarkFinalBar({ openItems, canUndo, onUndo, onMarkFinal, pending, disabled }: {
  openItems: OpenItem[];
  canUndo: boolean;
  onUndo: () => void;
  onMarkFinal: () => void;
  pending: boolean;
  disabled: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const open = openItems.length;
  const names = openItemNames(openItems);

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <Button variant="ghost" size="sm" disabled={!canUndo} onClick={onUndo}>
        <Undo2 strokeWidth={1.5} /> Undo
      </Button>
      <span className="text-sm text-muted-foreground" aria-live="polite">
        {open > 0 ? `${open} still open` : "Ready for the client to read"}
      </span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={<span className="inline-block" />}>
            <Button disabled={disabled || pending} onClick={() => (open > 0 ? setAsking(true) : onMarkFinal())}>
              {pending ? <Loader2 className="animate-spin" strokeWidth={1.5} /> : <CheckCircle2 strokeWidth={1.5} />}
              Mark final
            </Button>
          </TooltipTrigger>
          <TooltipContent>Moves the script to Visualise.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{open === 1 ? "1 thing is still open" : `${open} things are still open`}</AlertDialogTitle>
            <AlertDialogDescription>Mark final anyway? They stay in the notes, so you can settle them in Visualise.</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {names.slice(0, SHOWN).map((n, i) => <li key={`${i}-${n}`}>{n}</li>)}
            {open > SHOWN && <li className="list-none text-muted-foreground">and {open - SHOWN} more</li>}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onMarkFinal}>Mark final</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
