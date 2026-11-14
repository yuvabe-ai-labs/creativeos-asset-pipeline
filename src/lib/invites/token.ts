import { randomBytes } from "node:crypto";

// D502/D506: the link carries a random token, stored as issued so Copy link always shows the same
// link (Arun, 13 Nov). The table is server-only; a link is single use and expires after 7 days.
export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function inviteLink(token: string): string {
  const base = process.env.APP_URL;
  if (!base) throw new Error("APP_URL env var not set");
  return `${base.replace(/\/$/, "")}/invite/${token}`;
}
