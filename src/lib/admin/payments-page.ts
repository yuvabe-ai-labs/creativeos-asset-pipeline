import type { AttentionItem } from "@/lib/admin/models-list";
import type { AttentionPlan } from "@/lib/db/billing-admin-payments";
import { PAYMENT_DUE_END_DAYS } from "@/lib/billing/constants";
import { withGst } from "@/lib/billing/gst";
import { formatRupees } from "@/lib/billing/pricing";
import { formatIstDate, relativeIstDay } from "./ist";

// Admin › Payments (D592): Needs a look, worded for each plan. Client-safe and pure.

const DAY_MS = 86_400_000;

export const billingHref = (orgId: string) => `/admin/orgs/${orgId}?tab=billing`;

/** A due payment says what is unpaid, since when, what is paused and the day the plan ends; a
 *  cancelled plan says the day it ends. Each opens the agency's billing. */
export function paymentAttentionItems(plans: AttentionPlan[], now: Date): AttentionItem[] {
  return plans.map((p) => {
    const base = { key: `${p.status}-${p.orgId}`, modelId: null, name: p.orgName, action: "Open billing", href: billingHref(p.orgId) };
    if (p.status === "payment_due") {
      const amount = p.amountMinor !== null ? ` of ${formatRupees(withGst(p.amountMinor))}` : "";
      const since = p.paymentDueSince ? new Date(p.paymentDueSince) : null;
      const ends = since ? new Date(since.getTime() + PAYMENT_DUE_END_DAYS * DAY_MS) : null;
      return {
        ...base,
        tone: "bad" as const,
        text: `${p.planName ?? "Plan"} renewal${amount} unpaid${since ? ` since ${formatIstDate(since, false)}` : ""}`,
        detail: `AI runs are paused.${ends ? ` The plan ends on ${formatIstDate(ends, false)} if it stays unpaid.` : ""}`,
      };
    }
    const end = p.periodEnd ? new Date(p.periodEnd) : null;
    return {
      ...base,
      tone: "warn" as const,
      text: `${p.planName ?? "The plan"} was cancelled and ends ${end ? `on ${formatIstDate(end, false)}, ${relativeIstDay(end, now)}` : "soon"}`,
      detail: "",
    };
  });
}
