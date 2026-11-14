"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyRow } from "@/components/shared/copy-row";
import { useInviteToClient } from "@/hooks/queries/people";
import { INVITE_NEXT_STEP } from "@/lib/people/constants";
import type { InviteResult } from "@/lib/people/types";

// Step 2, "Invite someone new": the invitation is for this client; the link is emailed and shown
// to copy (to whoever sent it, owner or Invite holder). Refusals come back from the server in the
// spec's words. The new person waits as Signed up until the owner gives access.
export function InviteDialogEmailStep({ orgId, client, canManage, onBack }: {
  orgId: string;
  client: { id: string; name: string };
  canManage: boolean;
  onBack: () => void;
}) {
  const invite = useInviteToClient(orgId, client.id);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<InviteResult | null>(null);
  const nextStep = canManage ? INVITE_NEXT_STEP.owner : INVITE_NEXT_STEP.inviter;

  if (sent) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          {sent.emailed ? `Invite sent to ${sent.invite.email}.` : `The email wasn't sent. Copy the link and send it to ${sent.invite.email}.`}
        </p>
        <CopyRow label="Invite link" value={sent.link} />
        <p className="text-xs text-muted-foreground">{nextStep}</p>
        <div><Button variant="outline" onClick={onBack}>Back</Button></div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          setSent(await invite.mutateAsync(email));
        } catch {
          // The refusal is shown below through invite.error.
        }
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">{nextStep}</p>
      {invite.error && <p className="text-sm text-destructive">{invite.error.message}</p>}
      <div className="flex justify-between gap-3">
        <Button type="button" variant="outline" onClick={onBack}>Back</Button>
        <Button type="submit" disabled={!email.trim() || invite.isPending}>{invite.isPending ? "Sending…" : "Send invite"}</Button>
      </div>
    </form>
  );
}
