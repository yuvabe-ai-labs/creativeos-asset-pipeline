import { CREDIT_REFUSALS, type CreditRefusal } from "./grants";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";

// What a person sees when an AI run is refused (spec 2026-11-21-owner-billing-design.md, D523).
// Owners get the step that fixes it, with a link to billing; members never see credits or billing
// and are told to ask the owner.

export type RefusalCopy = { title: string; text: string; action: { label: string; href: string } | null };

const BILLING = "/billing";

const OWNER: Record<CreditRefusal, RefusalCopy> = {
  limit: { title: "Monthly credits used", text: "Your agency has used this month's credits. Yuvabe can raise the limit.", action: null },
  no_credits: { title: "Pick a plan to start generating", text: "AI runs need credits. Pick a plan and they're added as soon as the payment goes through.", action: { label: "See plans", href: `${BILLING}/plans` } },
  free_ended: { title: "Your free credits have ended", text: "Pick a plan to keep generating. Everything you made is still here.", action: { label: "See plans", href: `${BILLING}/plans` } },
  used_up: { title: "You've used your credits", text: "Top up to keep generating this month, or wait for your plan's next month.", action: { label: "Top up", href: BILLING } },
  payment_due: { title: "Your payment didn't go through", text: "AI runs are paused until it does. Nothing is lost; paying starts them again.", action: { label: "Open billing", href: BILLING } },
};

const MEMBER: Record<CreditRefusal, RefusalCopy> = {
  limit: { title: "Monthly credits used", text: "Your agency has used this month's credits. Ask your agency owner.", action: null },
  no_credits: { title: "AI runs aren't on yet", text: "Your agency hasn't picked a plan. Ask your agency owner.", action: null },
  free_ended: { title: "AI runs are paused", text: "Your agency's free credits have ended. Ask your agency owner.", action: null },
  used_up: { title: "AI runs are paused", text: "Your agency has used its credits. Ask your agency owner.", action: null },
  payment_due: { title: "AI runs are paused", text: "Your agency's payment hasn't gone through. Ask your agency owner.", action: null },
};

export function refusalCopy(reason: CreditRefusal, isOwner: boolean): RefusalCopy {
  const table = isOwner ? OWNER : MEMBER;
  // An unknown reason (an older server, a test double) reads as the monthly limit.
  return table[reason] ?? table.limit;
}

/** One line for a toast. */
export function refusalToast(reason: CreditRefusal, isOwner: boolean): string {
  const c = refusalCopy(reason, isOwner);
  return `${c.title}. ${c.text}`;
}

// Who is looking, for messages shown from code that has no React context (a 402 handler). Set once
// /api/me answers (ProfilePopover, always mounted); a member is assumed until then.
let viewerOwnsAgency = false;
export function setViewerOwnsAgency(isOwner: boolean): void {
  viewerOwnsAgency = isOwner;
}

/** The message for a refused run in the browser: the server sends the members' wording for the
 *  reason; owners get theirs instead. An older or unknown message falls back to the limit one. */
export function creditRefusalMessage(serverMessage: string | null | undefined): string {
  const reason = CREDIT_REFUSALS.find((r) => refusalToast(r, false) === serverMessage);
  if (reason) return refusalToast(reason, viewerOwnsAgency);
  return CREDIT_LIMIT_TOAST_MESSAGE;
}
