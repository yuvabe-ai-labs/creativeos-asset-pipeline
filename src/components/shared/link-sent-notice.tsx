"use client";

import { Link2, MailCheck } from "lucide-react";
import { CopyRow } from "./copy-row";

/** What an invite's sent screen says, for one recipient. Exported for tests. */
export function linkSentCopy(emailed: boolean, email: string): { title: string; body: string } {
  return emailed
    ? { title: `Invite sent to ${email}`, body: "They'll get an email with a link to sign up. You can also copy the link below." }
    : { title: `Invite ready for ${email}`, body: "We couldn't email it from here, so copy the link and send it to them yourself." };
}

// The one "invite sent" screen, shared by a client's invite popup, Add an agency and Invite an
// owner, so every place that hands over a sign-up link reads and looks the same.
export function LinkSentNotice({
  emailed,
  email,
  label,
  link,
  note,
}: {
  emailed: boolean;
  email: string;
  label: string;
  link: string;
  /** One more line under the link, e.g. what happens after they sign up. */
  note?: string;
}) {
  const { title, body } = linkSentCopy(emailed, email);
  const Icon = emailed ? MailCheck : Link2;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-4" strokeWidth={1.5} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate text-sm font-medium text-foreground" title={title}>{title}</p>
          <p className="text-sm text-muted-foreground">{body}</p>
        </div>
      </div>
      <CopyRow label={label} value={link} />
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
