// src/components/script-review/approve-reel.tsx
"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { errorMessage } from "@/lib/avatars/utils";
import { approveConfirmText } from "@/lib/script-review/threads";
import type { Thread } from "@/lib/script-review/types";

/** Spec 4 §8: Approve reel. With open threads, a confirm names them first; the client decides. */
export function ApproveReel({ openThreads, onApprove }: { openThreads: Thread[]; onApprove: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmText = approveConfirmText(openThreads);

  async function approve() {
    if (busy) return;
    setBusy(true);
    try {
      await onApprove();
      setConfirming(false);
    } catch (e) {
      toast.error(errorMessage(e, "Could not approve the reel."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => (confirmText ? setConfirming(true) : void approve())} disabled={busy}>
        <Check strokeWidth={1.5} />
        {busy ? "Approving…" : "Approve reel"}
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve with open comments?</AlertDialogTitle>
            <AlertDialogDescription>{confirmText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={approve} disabled={busy}>
              Approve anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
