"use client";

import { useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Cancel plan and Change plan ask once, saying what happens, before they act (D582). Plain Buttons,
// not the close primitives, so the dialog stays open until the step answers.
export function ConfirmStepDialog({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  trigger: ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const failed = await onConfirm();
    setBusy(false);
    if (failed) setError(failed);
    else setOpen(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!busy) { setOpen(next); setError(null); } }}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Keep my plan</Button>
          <Button onClick={() => void confirm()} disabled={busy}>{busy ? "Working…" : confirmLabel}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
