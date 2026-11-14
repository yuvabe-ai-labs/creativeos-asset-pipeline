"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyRow } from "@/components/shared/copy-row";
import { useCancelInvite, useResendInvite } from "@/hooks/queries/people";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { formatDate } from "@/lib/kb/utils";
import type { OpenInvite } from "@/lib/people/types";
import { MEMBERS_ACTIONS, MEMBERS_FULL_WIDTH, MEMBERS_ROW } from "./person-layout";

/** How long "Link copied." stays before it clears. */
const COPY_NOTICE_MS = 4000;

type Notice = { text: string; tone: "info" | "error"; fades: boolean };

// Spec §6.1 "Invited", and the invite rows of a client's Members list (one look for both): email,
// client, who invited them, sent, expiry. Copy link copies the stored link: the same link every
// time, no request. Resend issues a new link (the old one stops working) and emails it; the
// people list refreshes with the new link. Copy link, Resend and Cancel are the owner's
// (canManage); an Invite holder sees the row only, and the people read gives them no link (§6.2).
// The link is offered once: the Copy link button, or, once the link is shown (a Resend that
// wasn't emailed, or a copy the browser refused), the link with its own copy control instead.
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
  /** Given on a Members list: the row takes the list's Name / Status / Actions columns and shows
   *  this ("Invited") in Status, like a person row. */
  status?: string;
  canManage?: boolean;
}) {
  const resend = useResendInvite(orgId);
  const cancel = useCancelInvite(orgId);
  const [showLink, setShowLink] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const link = invite.link;
  const meta = [
    showClient ? invite.clientName : null,
    invite.invitedByName ? `invited by ${invite.invitedByName}` : null,
    `Sent ${formatRelativeTime(invite.sentAt)}`,
    // A future date: formatRelativeTime only reads the past ("just now" for anything ahead).
    `Expires ${formatDate(invite.expiresAt)}`,
  ].filter(Boolean).join(" · ");

  useEffect(() => {
    if (!notice?.fades) return;
    const timer = setTimeout(() => setNotice(null), COPY_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  async function copyLink() {
    if (!link) return;
    setNotice(null);
    try {
      await navigator.clipboard.writeText(link);
      setNotice({ text: "Link copied.", tone: "info", fades: true });
    } catch {
      setShowLink(true);
      setNotice({ text: "Couldn't copy the link. Select it below and copy it.", tone: "error", fades: false });
    }
  }

  async function resendInvite() {
    setNotice(null);
    try {
      const result = await resend.mutateAsync(invite.id);
      setShowLink(!result.emailed);
      setNotice(
        result.emailed
          ? { text: "Sent again with a new link. The old link no longer works.", tone: "info", fades: false }
          : { text: "The email wasn't sent. Copy the new link and send it to them.", tone: "info", fades: false },
      );
    } catch {
      // Shown below through resend.error.
    }
  }

  function cancelInvite() {
    setNotice(null);
    cancel.mutate(invite.id);
  }

  const error = resend.error ?? cancel.error;
  const columns = status !== undefined;
  const actions = canManage && (
    <div className={columns ? MEMBERS_ACTIONS : "flex flex-wrap items-center gap-2"}>
      {link && !showLink && <Button size="sm" variant="ghost" onClick={() => void copyLink()}>Copy link</Button>}
      <Button size="sm" variant="outline" disabled={resend.isPending} onClick={() => void resendInvite()}>Resend</Button>
      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={cancel.isPending} onClick={cancelInvite}>
        Cancel
      </Button>
    </div>
  );
  const who = (
    <div className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{invite.email}</span>
      <span className="text-xs text-muted-foreground">{meta}</span>
    </div>
  );
  const below = (
    <>
      {/* invite.link follows the people list, so after a Resend this is the new link. */}
      {showLink && link && <div className={MEMBERS_FULL_WIDTH}><CopyRow label="Invite link" value={link} /></div>}
      {notice && (
        <p className={`text-xs ${notice.tone === "error" ? "text-destructive" : "text-muted-foreground"} ${MEMBERS_FULL_WIDTH}`} role="status">
          {notice.text}
        </p>
      )}
      {error && <p className={`text-sm text-destructive ${MEMBERS_FULL_WIDTH}`}>{error.message}</p>}
    </>
  );

  if (columns) {
    return (
      <li className={MEMBERS_ROW}>
        {who}
        <span className="text-muted-foreground">{status}</span>
        {actions || <div className={MEMBERS_ACTIONS} />}
        {below}
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        {who}
        {actions}
      </div>
      {below}
    </li>
  );
}
