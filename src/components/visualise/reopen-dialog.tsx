"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// D346 — Reopen sends the script back to Generate, where its text is edited (spec 2).
export function ReopenDialog({ busy, onConfirm }: { busy: boolean; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" disabled={busy} onClick={() => setOpen(true)}>
        <Undo2 className="size-4" strokeWidth={1.5} />
        Reopen
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reopen in Generate?</AlertDialogTitle>
            <AlertDialogDescription>
              The script goes back to Generate so its text can change. Avatars and panels are kept; the panels of
              shots that change are marked out of date when it comes back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setOpen(false); onConfirm(); }}>Reopen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
