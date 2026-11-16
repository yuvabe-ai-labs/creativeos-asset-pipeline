"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CopyRow } from "@/components/shared/copy-row";
import { useCancelInvite, useResendInvite } from "@/hooks/queries/people";
import { inviteActions, type InviteActionId } from "@/lib/people/actions";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { formatDate } from "@/lib/kb/utils";
import type { OpenInvite } from "@/lib/people/types";
import type { PeopleColumns } from "./person-layout";
import { PersonRow } from "./person-row";
import { RowActions, type RowMenuItem } from "./row-actions";
import { StatusBadge } from "./status-badge";

/** How long "Link copied." stays before it clears. */
const COPY_NOTICE_MS = 4000;

type Notice = { text: string; tone: "info" | "error"; fades: boolean };

const LABELS: Record<InviteActionId, string> = { copy_link: "Copy invite link", resend: "Resend", cancel: "Cancel invite" };

// Spec §6.1 "Invited", and the invite rows of a client's Members list (one look for both): the
// email, who invited them, sent, expiry; the client in the Clients column on the Team page.
// Copy link copies the stored link: the same link every time, no request. Resend issues a new
// link (the old one stops working) and emails it; the people list refreshes with the new link.
// The menu is the owner's (canManage); an Invite holder sees the row only, and the people read
// gives them no link (§6.2). The link is offered once: the menu's Copy, or, once the link is
// shown (a Resend that wasn't emailed, or a copy the browser refused), the link to copy by hand.
export function InviteEntryRow({
  orgId,
  invite,
  columns,
  clientsCell,
  canManage,
}: {
  orgId: string;
  invite: OpenInvite;
  columns: PeopleColumns;
  clientsCell?: ReactNode;
  canManage: boolean;
}) {
  const resend = useResendInvite(orgId);
  const cancel = useCancelInvite(orgId);
  const [showLink, setShowLink] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const link = invite.link;
  const detail = [
    invite.invitedByName ? `Invited by ${invite.invitedByName}` : null,
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

  const run: Record<InviteActionId, () => void> = {
    copy_link: () => void copyLink(),
    resend: () => void resendInvite(),
    cancel: cancelInvite,
  };
  const items = inviteActions(invite, { canManage, linkShown: showLink }).map(
    (key): RowMenuItem => ({
      key,
      label: LABELS[key],
      destructive: key === "cancel",
      disabled: (key === "resend" && resend.isPending) || (key === "cancel" && cancel.isPending),
      onSelect: run[key],
    }),
  );
  const error = resend.error ?? cancel.error;
  const below = (showLink && link) || notice || error ? (
    <>
      {/* invite.link follows the people list, so after a Resend this is the new link. */}
      {showLink && link && <CopyRow label="Invite link" value={link} />}
      {notice && (
        <p className={`text-xs ${notice.tone === "error" ? "text-destructive" : "text-muted-foreground"}`} role="status">
          {notice.text}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
    </>
  ) : undefined;

  return (
    <PersonRow
      columns={columns}
      name={invite.email}
      detail={detail}
      invited
      status={<StatusBadge status="invited" />}
      clients={clientsCell}
      actions={<RowActions items={items} label={`More actions for the invite to ${invite.email}`} />}
      below={below}
    />
  );
}
