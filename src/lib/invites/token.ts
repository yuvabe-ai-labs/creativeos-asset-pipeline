import "server-only";
import { randomBytes } from "node:crypto";

// D540/D544: the link carries a random token, stored as issued so Copy link always shows the same
// link (Arun, 13 Nov). The table is server-only; a link is single use and expires after 7 days.
export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The one place an invite link is built. Without APP_URL it is the path alone: it still works
 *  when copied on this site, and the people rules never email it (isFullInviteLink). */
export function inviteLink(token: string): string {
  const path = `/invite/${token}`;
  const base = process.env.APP_URL;
  return base ? `${base.replace(/\/$/, "")}${path}` : path;
}

/** False for a path-only link (APP_URL not set): it means nothing in an email. */
export function isFullInviteLink(link: string): boolean {
  return !link.startsWith("/");
}
