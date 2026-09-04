"use client";

import { useState } from "react";
import { addOrgMemberAction } from "@/lib/actions/admin";
import { ORG_ROLES } from "@/lib/orgs/org-schema";
import { Button } from "@/components/ui/button";
import { CopyRow } from "@/components/admin/copy-row";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";

// R1.1/R1.2: one step creates the auth user, the profile and the membership, and returns
// a temp password to share out of band — the same shape createOrgWithOwner uses for an
// org's first seat.
//
// Plain Buttons (not the Close primitives), the same convention as
// reset-password-dialog.tsx and delete-confirm-dialog.tsx: a click must not auto-close
// the dialog before the async call resolves, or before the shown-once password renders.
export function AddMemberDialog({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [orgRole, setOrgRole] = useState<string>("designer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; tempPassword: string } | null>(null);

  function resetState() {
    setEmail("");
    setDisplayName("");
    setOrgRole("designer");
    setSaving(false);
    setError(null);
    setResult(null);
  }

  function onOpenChange(next: boolean) {
    if (saving) return;
    setOpen(next);
    if (!next) resetState();
  }

  async function submit() {
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.set("email", email);
    fd.set("displayName", displayName);
    fd.set("orgRole", orgRole);
    const res = await addOrgMemberAction(orgId, fd);
    setSaving(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setResult(res?.result ?? null);
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Add member
      </Button>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          {result ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Added {result.email}</AlertDialogTitle>
                <AlertDialogDescription>
                  Share these credentials with them out-of-band (Slack, email). Shown once —
                  they&apos;ll be asked to choose their own password on first login.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {/* Same CopyRow pair new-org-dialog.tsx uses for an org's first seat — this
                  is the same shown-once credential handoff, so it gets the same affordance
                  rather than a bare unselectable <p> (TC-002). */}
              <div className="flex flex-col gap-2">
                <CopyRow label="Email" value={result.email} />
                <CopyRow label="Temp password" value={result.tempPassword} />
              </div>
              <AlertDialogFooter>
                <Button type="button" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Add a member</AlertDialogTitle>
                <AlertDialogDescription>
                  Creates their login and adds them to this agency with the role you pick.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="member-email">Email</Label>
                  <Input
                    id="member-email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ruby@aurora.studio"
                    disabled={saving}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="member-name">Display name</Label>
                  <Input
                    id="member-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ruby"
                    disabled={saving}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="member-role">Role</Label>
                  {/* Base UI's onValueChange is (string | null) — a null clear would
                      leave the form with no role, so fall back to the default. */}
                  <Select
                    value={orgRole}
                    onValueChange={(v) => setOrgRole(v ?? "designer")}
                    disabled={saving}
                  >
                    <SelectTrigger id="member-role" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORG_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground/70">
                    Only owners and seniors can approve work.
                  </span>
                </div>
              </div>

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
                <Button type="button" disabled={saving} onClick={() => void submit()}>
                  {saving ? "Adding…" : "Add member"}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
