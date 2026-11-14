import type { Email } from "./send";

// The four emails of spec §6.7. Plain text first; the html is the same words with one button.

export function appLink(path: string): string {
  const base = process.env.APP_URL;
  if (!base) throw new Error("APP_URL env var not set");
  return `${base.replace(/\/$/, "")}${path}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function compose(to: string[], subject: string, lines: string[], action: { label: string; link: string }): Email {
  const text = [...lines, "", `${action.label}: ${action.link}`].join("\n");
  const html = [
    ...lines.map((l) => `<p>${escapeHtml(l)}</p>`),
    `<p><a href="${escapeHtml(action.link)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#5829c7;color:#ffffff;text-decoration:none">${escapeHtml(action.label)}</a></p>`,
  ].join("");
  return { to, subject, text, html };
}

export function memberInviteEmail(a: { to: string; agency: string; inviter: string; client: string; link: string }): Email {
  return compose([a.to], `You're invited to ${a.agency}`, [
    `${a.inviter} has invited you to join ${a.agency} on CreativeOS, to work on ${a.client}.`,
    "The link works for 7 days.",
  ], { label: `Join ${a.agency}`, link: a.link });
}

export function ownerInviteEmail(a: { to: string; agency: string; link: string }): Email {
  return compose([a.to], `Set up ${a.agency} on CreativeOS`, [
    `You're the owner of ${a.agency} on CreativeOS. Create your account to set it up and invite your team.`,
    "The link works for 7 days.",
  ], { label: `Set up ${a.agency}`, link: a.link });
}

/** To the owner (with the Team page line and button) or to whoever sent the invite (spec §6.3). */
export function signedUpEmail(a: { to: string[]; name: string; agency: string; link: string; forOwner: boolean }): Email {
  const line = `${a.name} signed up to ${a.agency}.`;
  return a.forOwner
    ? compose(a.to, `${a.name} signed up to ${a.agency}`, [`${line} Give them permissions on the Team page.`], { label: "Open the Team page", link: a.link })
    : compose(a.to, `${a.name} signed up to ${a.agency}`, [line], { label: "Open CreativeOS", link: a.link });
}

export function accessReadyEmail(a: { to: string; agency: string; link: string }): Email {
  return compose([a.to], `Your access to ${a.agency} is ready`, [
    `Your access to ${a.agency} on CreativeOS is ready. Your clients are waiting for you.`,
  ], { label: "Open CreativeOS", link: a.link });
}
