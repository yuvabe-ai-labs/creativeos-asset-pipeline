"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteConfirmCopy } from "@/lib/nodes/delete-confirm";

type Props = {
  open: boolean;
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
};

// Presentational only — the promise/resolver plumbing lives in useDeleteConfirmation.
// Plain Buttons (not the Close-primitive actions) so a click resolves the choice
// exactly once; onOpenChange handles ESC/backdrop dismissal as a cancel.
export function DeleteConfirmDialog({ open, count, onConfirm, onCancel }: Props) {
  const { title, description } = deleteConfirmCopy(count);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
