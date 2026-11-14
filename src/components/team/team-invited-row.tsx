"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyRow } from "@/components/shared/copy-row";
import { useCancelInvite, useResendInvite } from "@/hooks/queries/people";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { formatDate } from "@/lib/kb/utils";
import type { OpenInvite } from "@/lib/people/types";

// Spec §6.1 "Invited", and the invite rows of a client's Members list (one look for both): email,
// client, who invited them, sent, expiry. Copy link copies the stored link: the same link every
// time, no request. Resend issues a new link (the old one stops working) and emails it; the
// people list refreshes with the new link. Copy link, Resend and Cancel are the owner's
// (canManage); an Invite holder sees the row only, and the people read gives them no link (§6.2).
export function TeamInvitedRow({
  orgId,
  invite,
  showClient = true,
  status,
  canManage = true,
}: {
  orgId: string;
  invite: OpenInvite;
  showClient?: boolean;
  /** The Members list shows the status ("Invited") beside the email. */
  status?: string;
  canManage?: boolean;
}) {
  const resend = useResendInvite(orgId);
  const cancel = useCancelInvite(orgId);
  const [showLink, setShowLink] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const link = invite.link;
  const meta = [
    showClient ? invite.clientName : null,
    invite.invitedByName ? `invited by ${invite.invitedByName}` : null,
    `Sent ${formatRelativeTime(invite.sentAt)}`,
    // A future date: formatRelativeTime only reads the past ("just now" for anything ahead).
    `Expires ${formatDate(invite.expiresAt)}`,
  ].filter(Boolean).join(" · ");

  function copyLink() {
    if (!link) return;
    void navigator.clipboard.writeText(link);
    setShowLink(true);
    setNotice("Link copied.");
  }

  async function resendInvite() {
    try {
      const result = await resend.mutateAsync(invite.id);
      setShowLink(!result.emailed);
      setNotice(result.emailed ? "Sent again with a new link. The old link no longer works." : "The email wasn't sent. Copy the new link and send it to them.");
    } catch {
      // Shown below through resend.error.
    }
  }

  const error = resend.error ?? cancel.error;
  return (
    <li className="flex flex-col gap-2 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{invite.email}</span>
          {status && <span className="text-xs text-muted-foreground">{status}</span>}
          <span className="text-xs text-muted-foreground">{meta}</span>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {link && <Button size="sm" variant="ghost" onClick={copyLink}>Copy link</Button>}
            <Button size="sm" variant="outline" disabled={resend.isPending} onClick={() => void resendInvite()}>Resend</Button>
            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={cancel.isPending} onClick={() => cancel.mutate(invite.id)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
      {/* invite.link follows the people list, so after a Resend this is the new link. */}
      {showLink && link && <CopyRow label="Invite link" value={link} />}
      {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
    </li>
  );
}
