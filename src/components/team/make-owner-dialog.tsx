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

// Spec §6.6 Make owner, Admin only. Moving ownership is big and hard to undo, so it asks first.
// Same convention as RemovePersonDialog: plain Buttons, so the dialog stays open until the change
// resolves and a refusal can be read.
export function MakeOwnerDialog({ name, onConfirm }: { name: string; onConfirm: () => Promise<unknown> }) {
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
      setError(e instanceof Error ? e.message : "Could not change the owner.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Make owner
      </Button>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make {name} the owner?</AlertDialogTitle>
            <AlertDialogDescription>
              {name} can do everything in this agency, including managing the team and credits. The
              current owner becomes a member with every permission on every client.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void confirm()}>
              {saving ? "Saving…" : "Make owner"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
