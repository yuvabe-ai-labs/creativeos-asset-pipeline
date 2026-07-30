"use client";

import { useState } from "react";
import { resetMemberPasswordAction } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";

type Mode = "auto" | "set";

// Plain Buttons (not the Close-primitive actions), same convention as
// delete-confirm-dialog.tsx — a click must not auto-close the dialog before the async
// reset resolves or before the "shown once" result view can render.
export function ResetPasswordDialog({
  orgId,
  userId,
  displayName,
}: {
  orgId: string;
  userId: string;
  displayName: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("auto");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  function resetState() {
    setMode("auto");
    setDraft("");
    setSaving(false);
    setError(null);
    setTempPassword(null);
  }

  function onOpenChange(next: boolean) {
    if (saving) return;
    setOpen(next);
    if (!next) resetState();
  }

  async function confirmReset() {
    setSaving(true);
    setError(null);
    const res = await resetMemberPasswordAction(orgId, userId, mode === "set" ? draft : "");
    setSaving(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setTempPassword(res?.result?.tempPassword ?? null);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Reset password
      </Button>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          {tempPassword ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>New password for {displayName}</AlertDialogTitle>
                <AlertDialogDescription>
                  Share this with them out-of-band (Slack, email). Shown once — this dialog
                  will not show the password again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <p className="rounded-lg border bg-muted/40 px-3 py-2 font-mono text-sm">
                {tempPassword}
              </p>
              <AlertDialogFooter>
                <Button type="button" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset password for {displayName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Their current password stops working immediately. You&apos;ll get a new
                  one to share with them.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="inline-flex w-fit gap-1 rounded-lg border border-border bg-muted/40 p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "auto" ? "default" : "ghost"}
                  disabled={saving}
                  onClick={() => {
                    setMode("auto");
                    setError(null);
                  }}
                >
                  Auto-generate
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "set" ? "default" : "ghost"}
                  disabled={saving}
                  onClick={() => {
                    setMode("set");
                    setError(null);
                  }}
                >
                  Set specific password
                </Button>
              </div>

              {mode === "set" && (
                <Input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="At least 8 characters"
                  disabled={saving}
                />
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <AlertDialogFooter>
                <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="button" disabled={saving} onClick={() => void confirmReset()}>
                  {saving ? "Resetting…" : "Reset password"}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
