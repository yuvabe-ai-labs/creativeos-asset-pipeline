"use client";

import { useState } from "react";
import { inviteOwnerAction, type OwnerInviteResult } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinkSentNotice } from "@/components/shared/link-sent-notice";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// Remounted (key) on every opening so a finished invite doesn't show again next time.
function InviteOwnerBody({ orgId, orgName, onDone }: { orgId: string; orgName: string; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<OwnerInviteResult | null>(null);

  if (result?.link) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Owner invited</DialogTitle>
          <DialogDescription>They can do everything in {orgName} once they sign up.</DialogDescription>
        </DialogHeader>
        <LinkSentNotice emailed={result.emailed ?? false} email={result.email ?? ""} label="Owner's sign-up link" link={result.link} />
        <DialogFooter><Button onClick={onDone}>Done</Button></DialogFooter>
      </>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        try {
          setResult(await inviteOwnerAction(orgId, email));
        } catch {
          setResult({ error: "Could not send the invite." });
        } finally {
          setPending(false);
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Invite an owner</DialogTitle>
        <DialogDescription>{orgName} has no owner. They get an email to sign up, and can do everything in this agency.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="owner-email">Owner&apos;s email</Label>
        <Input id="owner-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </div>
      {result?.error && <p className="text-sm text-destructive">{result.error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={pending || email.trim() === ""}>{pending ? "Sending…" : "Send invite"}</Button>
      </DialogFooter>
    </form>
  );
}

// The agencies list's action for an agency with no owner and no open owner invite (spec §6.6).
export function InviteOwnerDialog({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(0);
  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) setOpening((n) => n + 1); }}>
      <DialogTrigger render={<Button size="sm" variant="outline">Invite an owner</Button>} />
      <DialogContent className="sm:max-w-md">
        <InviteOwnerBody key={opening} orgId={orgId} orgName={orgName} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
