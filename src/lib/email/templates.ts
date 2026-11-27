import { formatDay, lastDayOf } from "@/lib/billing/dates";
import { formatRupees } from "@/lib/billing/pricing";
import { formatIstDate } from "@/lib/admin/ist";
import type { Email } from "./send";

// The four emails of spec §6.7, the password reset link (D598), the plan price notices (D593, D595) and the credit notices (D596). Plain text first; the html is the same words laid out as a card
// (the "B · Card" design of 18 Nov): wordmark, a white card with a heading, the message, one
// button, a small note, the link written out, and a footer. Tables and inline styles only, and
// Arial, because email apps don't load web fonts or style sheets.

export function appLink(path: string): string {
  const base = process.env.APP_URL;
  if (!base) throw new Error("APP_URL env var not set");
  return `${base.replace(/\/$/, "")}${path}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FONT = "Arial, Helvetica, sans-serif";
const INK = "#0b0f19";
const TEXT = "#1f2430";
const MUTED = "#667085";
const LINE = "#e4e7ec";
const PAGE = "#f9fafb";
const BRAND = "#5829c7";

type Layout = {
  to: string[];
  subject: string;
  /** Shown by inbox apps next to the subject; hidden in the email itself. */
  preview: string;
  heading: string;
  lines: string[];
  action: { label: string; link: string };
  /** Small print under the button, e.g. how long the link works. */
  note?: string;
};

function compose({ to, subject, preview, heading, lines, action, note }: Layout): Email {
  const text = [...lines, ...(note ? [note] : []), "", `${action.label}: ${action.link}`].join("\n");
  const link = escapeHtml(action.link);
  const p = (value: string, style: string) => `<p style="font-family:${FONT};${style}">${escapeHtml(value)}</p>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>`
    + `<body style="margin:0;padding:0;background:${PAGE}">`
    + `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preview)}</div>`
    + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${PAGE}"><tr><td align="center" style="padding:28px 14px">`
    + `<table role="presentation" width="100%" style="max-width:540px" cellspacing="0" cellpadding="0" border="0">`
    // Wordmark.
    + `<tr><td align="center" style="padding:0 4px 18px"><span style="font-family:${FONT};font-size:19px;font-weight:700;color:${INK};letter-spacing:-0.2px">Creative<span style="color:${BRAND}">OS</span></span></td></tr>`
    // Card.
    + `<tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:14px;padding:36px 36px 30px;text-align:left">`
    + `<h1 style="margin:0;font-family:${FONT};font-size:24px;line-height:30px;font-weight:700;color:${INK}">${escapeHtml(heading)}</h1>`
    + lines.map((l, i) => p(l, `margin:${i === 0 ? 14 : 10}px 0 0;font-size:16px;line-height:25px;color:${TEXT}`)).join("")
    + `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:26px"><tr><td align="center" bgcolor="${BRAND}" style="border-radius:8px">`
    + `<a href="${link}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(action.label)}</a>`
    + `</td></tr></table>`
    + (note ? p(note, `margin:18px 0 0;font-size:13px;line-height:19px;color:${MUTED}`) : "")
    + `<p style="margin:16px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED}">Or copy this link: <a href="${link}" style="color:${BRAND};word-break:break-all">${link}</a></p>`
    + `</td></tr>`
    // Footer.
    + `<tr><td align="center" style="padding:18px 8px 0"><p style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};text-align:center">CreativeOS by Yuvabe Studios.</p></td></tr>`
    + `</table></td></tr></table></body></html>`;
  return { to, subject, text, html };
}

export function memberInviteEmail(a: { to: string; agency: string; inviter: string; client: string; link: string }): Email {
  return compose({
    to: [a.to],
    subject: `You're invited to ${a.agency}`,
    preview: `${a.inviter} invited you to work on ${a.client}.`,
    heading: `Join ${a.agency} on CreativeOS`,
    lines: [`${a.inviter} has invited you to join ${a.agency} on CreativeOS, to work on ${a.client}.`],
    action: { label: `Join ${a.agency}`, link: a.link },
    note: "The link works for 7 days.",
  });
}

export function ownerInviteEmail(a: { to: string; agency: string; link: string; freeCredits?: { credits: number; day: string } }): Email {
  const lines = [`You're the owner of ${a.agency} on CreativeOS. Create your account to set it up and invite your team.`];
  // An agency that pays for a plan can start with free credits (billing piece 2).
  if (a.freeCredits) {
    lines.push(`You have ${a.freeCredits.credits.toLocaleString("en-US")} free credits to try CreativeOS until ${formatDay(a.freeCredits.day)}.`);
  }
  return compose({
    to: [a.to],
    subject: `Set up ${a.agency} on CreativeOS`,
    preview: "Create your account to set up your agency.",
    heading: `Set up ${a.agency}`,
    lines,
    action: { label: `Set up ${a.agency}`, link: a.link },
    note: "The link works for 7 days.",
  });
}

/** Forgot password (D598). Goes only to an email that has an account; the link opens a form and
 *  nothing is used up until that form is sent. */
export function passwordResetEmail(a: { to: string; link: string }): Email {
  return compose({
    to: [a.to],
    subject: "Set a new password for CreativeOS",
    preview: "Use this link to set a new password.",
    heading: "Set a new password",
    lines: ["Someone asked to set a new password for your CreativeOS account. Use the button below to choose one."],
    action: { label: "Set a new password", link: a.link },
    note: "The link works for 1 hour. If you didn't ask for this, ignore this email and your password stays the same.",
  });
}

/** To the owner (with the Team page line and button) or to whoever sent the invite (spec §6.3). */
export function signedUpEmail(a: { to: string[]; name: string; agency: string; link: string; forOwner: boolean }): Email {
  const line = `${a.name} signed up to ${a.agency}.`;
  return compose({
    to: a.to,
    subject: `${a.name} signed up to ${a.agency}`,
    preview: a.forOwner ? "Give them permissions on the Team page." : `${a.name} has joined ${a.agency}.`,
    heading: `${a.name} signed up`,
    lines: [a.forOwner ? `${line} Give them permissions on the Team page.` : line],
    action: a.forOwner ? { label: "Open the Team page", link: a.link } : { label: "Open CreativeOS", link: a.link },
  });
}

export function accessReadyEmail(a: { to: string; agency: string; link: string }): Email {
  return compose({
    to: [a.to],
    subject: `Your access to ${a.agency} is ready`,
    preview: "Your clients are waiting for you.",
    heading: "You're in",
    lines: [`Your access to ${a.agency} on CreativeOS is ready. Your clients are waiting for you.`],
    action: { label: "Open CreativeOS", link: a.link },
  });
}

/** To the owners when Yuvabe's new price for their plan is set up to start at the next renewal
 *  (D593). Amounts with GST, as the owner is charged. */
export function planPriceChangeEmail(a: {
  to: string[];
  agency: string;
  plan: string;
  /** The plan they are on now (false: a plan they chose earlier, whose price changed). */
  samePlan: boolean;
  fromMinor: number | null;
  toMinor: number;
  credits: number;
  startsAt: string | null;
  link: string;
}): Email {
  const when = a.startsAt ? `From your renewal on ${formatIstDate(new Date(a.startsAt))}` : "From your next renewal";
  const price = `${formatRupees(a.toMinor)} a month with GST, for ${a.credits.toLocaleString("en-IN")} credits every month`;
  const lines = [
    a.samePlan
      ? `${when}, the ${a.plan} plan for ${a.agency} is ${price}.${a.fromMinor !== null ? ` You pay ${formatRupees(a.fromMinor)} now.` : ""}`
      : `${when}, ${a.plan}, the plan ${a.agency} moves to, is ${price}.`,
    "Until then nothing changes. You can change or cancel your plan on the Billing page before that day.",
  ];
  return compose({
    to: a.to,
    subject: `The price of your ${a.plan} plan is changing`,
    preview: `${when}: ${formatRupees(a.toMinor)} a month with GST.`,
    heading: "Your plan's price is changing",
    lines,
    action: { label: "Open Billing", link: a.link },
  });
}

/** To the owners when a new price for their plan needs their approval, because the way they pay
 *  can't move to it on its own (D595), and once more 3 days before the end date. Amounts with GST. */
export function planPriceApprovalEmail(a: {
  to: string[];
  agency: string;
  plan: string;
  toMinor: number;
  credits: number;
  endsAt: string;
  reminder: boolean;
  link: string;
}): Email {
  const by = formatIstDate(new Date(a.endsAt));
  const lines = [
    `The price of the ${a.plan} plan for ${a.agency} is changing to ${formatRupees(a.toMinor)} a month with GST, for ${a.credits.toLocaleString("en-IN")} credits every month.`,
    `The way you pay can't move to a new price by itself, so it needs your approval. Approve it on the Billing page before ${by}, or your plan ends that day.`,
    `Approving takes a ₹5 check that's refunded. Your first payment at the new price is on ${by}, and nothing changes until then.`,
  ];
  return compose({
    to: a.to,
    subject: a.reminder ? `Approve your plan's new price by ${by}` : `Approve the new price of your ${a.plan} plan`,
    preview: `Approve before ${by}, or your plan ends then.`,
    heading: a.reminder ? "Your plan ends soon unless you approve" : "Approve your plan's new price",
    lines,
    action: { label: "Approve on Billing", link: a.link },
  });
}

const credits = (n: number) => Math.floor(n).toLocaleString("en-IN");
/** The last day credits ending at `endsAt` can be used, as `3 Dec 2026`. */
const lastDay = (endsAt: string) => formatDay(lastDayOf(endsAt));

/** To the owners when 80% or more of the agency's open credits are used (D596), once per credit
 *  period. `soonest` is the open grant with credits left that ends first. A top-up is offered only
 *  on a running plan (top-ups end with the plan month). */
export function lowCreditsEmail(a: {
  to: string[];
  agency: string;
  usedPercent: number;
  left: number;
  total: number;
  soonest: { left: number; endsAt: string } | null;
  onPlan: boolean;
  link: string;
}): Email {
  const ends = a.soonest
    ? a.soonest.left >= a.left
      ? ` They can be used until ${lastDay(a.soonest.endsAt)}.`
      : ` ${credits(a.soonest.left)} of them can be used until ${lastDay(a.soonest.endsAt)}.`
    : "";
  const next = a.onPlan
    ? "To keep making things, buy a top-up or move to a bigger plan on the Billing page. Top-ups end with your plan month."
    : "To keep making things, pick a plan on the Billing page.";
  return compose({
    to: a.to,
    subject: "Your CreativeOS credits are running low",
    preview: `${credits(a.left)} credits left for ${a.agency}.`,
    heading: "Your credits are running low",
    lines: [`${a.agency} has used ${a.usedPercent}% of its credits. ${credits(a.left)} of ${credits(a.total)} credits are left.${ends}`, next],
    action: { label: a.onPlan ? "Open Billing" : "Pick a plan", link: a.link },
  });
}

/** To the owners 3 days before a free grant ends while the agency has no plan (D596), once per grant. */
export function freeCreditsEndingEmail(a: { to: string[]; agency: string; left: number; endsAt: string; link: string }): Email {
  const day = lastDay(a.endsAt);
  return compose({
    to: a.to,
    subject: `Your free credits end on ${day.replace(/ \d{4}$/, "")}`,
    preview: `${credits(a.left)} free credits left. Pick a plan to keep making things.`,
    heading: "Your free credits end soon",
    lines: [
      `The free credits for ${a.agency} can be used until ${day}. You have ${credits(a.left)} of them left.`,
      "Pick a plan before then to keep making things. A plan gives you new credits every month.",
    ],
    action: { label: "Pick a plan", link: a.link },
  });
}
