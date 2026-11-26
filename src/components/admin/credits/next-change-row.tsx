"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { LEAD_MINUTES } from "@/lib/admin/credits-change";
import type { NextChange } from "@/lib/admin/credits-overview";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CreditsRow } from "./credits-row";
import { useCancelCreditChange } from "./use-cancel-credit-change";

const more = (n: number) => (n === 1 ? "1 more change is scheduled after it, in History." : `${n} more changes are scheduled after it, in History.`);

/** The Next row: the scheduled change in plain words, what it does to a typical run and held credits, and Cancel. */
export function NextChangeRow({ next }: { next: NextChange | null }) {
  const [confirming, setConfirming] = useState(false);
  const { cancel, busy } = useCancelCreditChange();

  if (!next) {
    return (
      <CreditsRow icon={<CalendarDays aria-hidden strokeWidth={1.5} className="size-4 text-muted-foreground/70" />} label="Next" muted>
        <span className="text-muted-foreground">No change scheduled.</span>
      </CreditsRow>
    );
  }

  return (
    <CreditsRow
      icon={<CalendarDays aria-hidden strokeWidth={1.5} className="size-4 text-primary" />}
      label={
        <span className="flex flex-col">
          <span>From {next.when}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {next.utc}, {next.relative}
          </span>
        </span>
      }
      action={
        next.canCancel ? (
          <Button id="credits-next-cancel" variant="outline" size="sm" disabled={busy} onClick={() => setConfirming(true)}>
            Cancel
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Starts in under {LEAD_MINUTES} minutes</span>
        )
      }
    >
      <span>
        <span className="font-semibold">{next.lead}.</span> {next.run}
      </span>
      {(next.held || next.more > 0) && (
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {[next.held, next.more > 0 ? more(next.more) : null].filter(Boolean).join(" ")}
        </span>
      )}
      <AlertDialog open={confirming} onOpenChange={(open) => !open && !busy && setConfirming(false)}>
        <AlertDialogContent finalFocus={() => document.getElementById("credits-next-cancel") ?? document.getElementById("credits-change-start") ?? true}>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {next.name}?</AlertDialogTitle>
            <AlertDialogDescription>It hasn&apos;t started, so no run used it.{next.kept ? ` ${next.kept}` : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                await cancel(next);
                setConfirming(false);
              }}
            >
              {busy ? "Cancelling…" : "Cancel the change"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CreditsRow>
  );
}
