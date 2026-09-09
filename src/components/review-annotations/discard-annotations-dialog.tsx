"use client";

import { useCallback, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type Pending = { count: number; resolve: (ok: boolean) => void };

// The confirmation gate for losing unsent annotations — approving, or cancelling the
// composer, throws away drafts that only exist client-side. Same promise/resolver shape
// as useDeleteConfirmation: `confirm()` stays unresolved until the senior answers.
export function useDiscardAnnotationsConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (count: number) =>
      // Nothing to lose — never interrupt for an empty draft list.
      count === 0
        ? Promise.resolve(true)
        : new Promise<boolean>((resolve) => setPending({ count, resolve })),
    [],
  );

  // Promise.resolve is idempotent, so a stray second call — ESC right after a button —
  // is harmless; the first answer wins.
  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return {
    confirm,
    dialogProps: {
      open: pending !== null,
      count: pending?.count ?? 0,
      onConfirm: () => settle(true),
      onCancel: () => settle(false),
    },
  };
}

// Presentational only — the promise plumbing lives in the hook above. Plain Buttons
// (not the Close primitives) so a click resolves the choice exactly once;
// onOpenChange handles ESC/backdrop dismissal as "keep annotating".
export function DiscardAnnotationsDialog({
  open,
  count,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Discard {count} annotation{count === 1 ? "" : "s"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            They have not been sent yet. Annotations are attached when you request
            changes — leaving now drops them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Keep annotating
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Discard
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
