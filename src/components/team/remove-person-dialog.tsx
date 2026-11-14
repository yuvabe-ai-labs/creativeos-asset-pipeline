"use client";

import { useState } from "react";
import { removeOrgMemberAction } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";

// D181. Plain Buttons rather than the Close-primitive actions, same convention as
// reset-password-dialog.tsx — a click must not auto-close the dialog before the async
// removal resolves, because the expected failure (removing an org's last owner) is one
// the operator has to actually READ.
export function RemoveMemberDialog({
  orgId,
  userId,
  displayName,
  email,
}: {
  orgId: string;
  userId: string;
  displayName: string;
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onOpenChange(next: boolean) {
    if (saving) return;
    setOpen(next);
    if (!next) setError(null);
  }

  async function confirmRemove() {
    setSaving(true);
    setError(null);
    const res = await removeOrgMemberAction(orgId, userId);
    setSaving(false);
    // On success the server revalidates the page and this row disappears with it, so
    // there is nothing to close — the component unmounts. Only a failure needs handling,
    // and it stays on screen rather than closing silently.
    if (res?.error) setError(res.error);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        Remove
      </Button>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes their account ({email}) and they lose access immediately. It
              cannot be undone — re-adding them creates a new account with a new temporary
              password.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Says the one thing an operator is most likely to be worried about before
              clicking an irreversible destructive button. */}
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Work they generated stays on its canvas. It will show as made by{" "}
            <span className="font-medium">an unknown maker</span>.
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={saving}
              onClick={() => void confirmRemove()}
            >
              {saving ? "Removing…" : "Remove member"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
