"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// D181, generalised for the Team page and Admin. Plain Buttons rather than the Close-primitive
// actions: a click must not close the dialog before the removal resolves, because a refusal
// (the owner can't be removed) is one the person has to read.
export function RemovePersonDialog({
  name,
  detail,
  onConfirm,
  label = "Remove",
}: {
  name: string;
  /** What removing does here, e.g. "They lose access to Acme and their login is deleted." */
  detail: string;
  onConfirm: () => Promise<void>;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onOpenChange(next: boolean) {
    if (saving) return;
    setOpen(next);
    if (!next) setError(null);
  }

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove them.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
            <AlertDialogDescription>{detail}</AlertDialogDescription>
          </AlertDialogHeader>
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Work they made stays where it is. It will show as made by <span className="font-medium">an unknown maker</span>.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={saving} onClick={() => void confirm()}>
              {saving ? "Removing…" : label}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
