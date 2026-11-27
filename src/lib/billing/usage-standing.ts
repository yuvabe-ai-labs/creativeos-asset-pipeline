// The four numbers at the top of the Usage page and its one notice (D597), for an agency that pays
// for a plan and for one Yuvabe manages. Pure and client-safe; computed on every render, nothing
// stored. The pace is the last 7 days' charges ÷ 7; how long credits last is what is left ÷ pace.
import { formatDay, formatShortDay, lastDayOf, todayIst } from "./dates";
import { PAYMENT_DUE_END_DAYS } from "./constants";
import { withGst } from "./gst";
import { formatRupees } from "./pricing";
import type { OpenGrant } from "./grants";
import type { OwnerBillingSummary } from "./summary";
import { dailyPace, type UsageOverview } from "./usage-overview";
import { USAGE_PERIOD_LABEL } from "./usage-period";

export type PlanStanding = {
  status: "created" | "active" | "payment_due" | "cancelling";
  planName: string | null;
  amountMinor: number | null;
  /** When the paid month ends: the renewal, or the end of a cancelled plan. */
  endsAt: string | null;
  /** When the payment first became due; the plan ends 30 days after (D585). */
  paymentDueSince: string | null;
};

export type UsageStanding =
  | { mode: "managed"; limit: number | null }
  | { mode: "plans"; summary: OwnerBillingSummary; plan: PlanStanding | null; planRunning: boolean; grants: OpenGrant[] };

export type Tone = "warn" | "bad" | null;
export type UsageTile = { label: string; value: string; sub: string; tone?: Tone; meter?: { share: number; tone: Tone } };
export type UsageNoticeAction = "pay" | "plans" | "top_up";
export type UsageNotice = { tone: "warn" | "bad"; title: string; body: string; action: UsageNoticeAction | null };

const DAY_MS = 86_400_000;
const n = (v: number) => Math.round(v).toLocaleString("en-IN");
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;
/** The day an exclusive end (stored as the next day's 00:00 India time) falls on. */
const lastDay = (iso: string) => formatDay(lastDayOf(iso));
const shortLastDay = (iso: string) => formatShortDay(lastDayOf(iso));
const dayOf = (d: Date) => formatDay(todayIst(d));
const shortDayOf = (d: Date) => formatShortDay(todayIst(d));
const shareTone = (share: number): Tone => (share >= 0.95 ? "bad" : share >= 0.8 ? "warn" : null);

/** The pace in round figures: hundreds once it is in the thousands. */
export function roundPace(pace: number): number {
  return pace >= 1000 ? Math.round(pace / 100) * 100 : Math.round(pace);
}

/** When `left` credits run out at `pace` a day, or null when nothing is being used. */
export function runOutAt(left: number, pace: number, now: Date): Date | null {
  if (pace <= 0) return null;
  return new Date(now.getTime() + (Math.max(0, left) / pace) * DAY_MS);
}

function paceTile(thisMonth: UsageOverview): UsageTile {
  const pace = dailyPace(thisMonth);
  if (pace <= 0) return { label: "Daily pace", value: "None yet", sub: thisMonth.total > 0 || thisMonth.previousTotal > 0 ? "Nothing used in the last 7 days" : "Shows once your team starts" };
  const change = thisMonth.prev7 > 0 ? Math.round(((thisMonth.last7 - thisMonth.prev7) / thisMonth.prev7) * 100) : null;
  const trend = change !== null && Math.abs(change) >= 3 ? `, ${change > 0 ? "up" : "down"} ${Math.abs(change)}% on the week before` : "";
  return { label: "Daily pace", value: n(roundPace(pace)), sub: `A day over the last 7 days${trend}` };
}

function usedTile(o: UsageOverview): UsageTile {
  const before = o.period === "this_month" ? "last month" : "the month before";
  return { label: `Used ${USAGE_PERIOD_LABEL[o.period].toLowerCase()}`, value: n(o.total), sub: `${plural(o.runs, "run", "runs")} · ${n(o.previousTotal)} ${before}` };
}

/** How long credits last, against the day they would end anyway. */
function lastsTile(left: number, thisMonth: UsageOverview, end: string | null, endSub: string, now: Date): UsageTile {
  if (left <= 0) return { label: "Lasts until", value: "Used up", sub: endSub, tone: "bad" };
  const out = runOutAt(left, dailyPace(thisMonth), now);
  if (!out) return { label: "Lasts until", value: "Too early to tell", sub: endSub };
  if (end && out.getTime() >= new Date(end).getTime()) return { label: "Lasts until", value: `Past ${shortLastDay(end)}`, sub: endSub };
  return { label: "Lasts until", value: `About ${shortDayOf(out)}`, sub: endSub, tone: "warn" };
}

/** The four numbers. `period` is the one picked; `thisMonth` gives the pace and a managed limit's use. */
export function usageTiles(s: UsageStanding, period: UsageOverview, thisMonth: UsageOverview, now: Date = new Date()): UsageTile[] {
  // A managed limit starts again when this month ends (00:00 India time on the 1st).
  const resets = thisMonth.to;
  if (s.mode === "managed") {
    if (s.limit === null) {
      const prevLabel = period.period === "this_month" ? "Last month" : "The month before";
      return [
        { label: `Used ${USAGE_PERIOD_LABEL[period.period].toLowerCase()}`, value: n(period.total), sub: "No monthly limit" },
        { label: prevLabel, value: n(period.previousTotal), sub: "In all" },
        paceTile(thisMonth),
        { label: "Runs", value: n(period.runs), sub: USAGE_PERIOD_LABEL[period.period] },
      ];
    }
    const used = thisMonth.total;
    const left = Math.max(0, s.limit - used);
    const share = s.limit > 0 ? Math.min(1, used / s.limit) : 1;
    return [
      { label: "Left this month", value: n(left), sub: `Of ${n(s.limit)} · starts again ${formatShortDay(todayIst(new Date(resets)))}`, meter: { share, tone: shareTone(share) } },
      usedTile(period),
      paceTile(thisMonth),
      lastsTile(left, thisMonth, resets, `The limit starts again on ${dayOf(new Date(resets))}`, now),
    ];
  }

  const { summary, plan } = s;
  if (plan?.status === "payment_due") {
    return [
      { label: "AI runs", value: "Paused", sub: "Until the payment goes through", tone: "bad" },
      { label: "Payment due", value: plan.amountMinor !== null ? formatRupees(withGst(plan.amountMinor)) : "Due", sub: "Incl. GST" },
      usedTile(period),
      { label: "Credits waiting", value: n(summary.left), sub: "Usable once it goes through" },
    ];
  }
  const free = !plan || plan.status === "created";
  const usedShare = summary.total > 0 ? (summary.total - summary.left) / summary.total : 0;
  const end = free ? summary.freeEndsAt : plan.endsAt;
  const endSub = free
    ? end ? `Free credits end ${lastDay(end)}` : "No plan yet"
    : plan.status === "cancelling" ? `Your plan ends ${end ? lastDay(end) : "soon"}` : `Plan renews ${end ? dayOf(new Date(end)) : "monthly"}`;
  return [
    {
      label: free ? "Free credits left" : "Credits left",
      value: n(summary.left),
      sub: summary.total > 0 ? `Of ${n(summary.total)} · ${Math.round(usedShare * 100)}% used` : "No credits right now",
      meter: summary.total > 0 ? { share: usedShare, tone: shareTone(usedShare) } : undefined,
    },
    usedTile(period),
    paceTile(thisMonth),
    lastsTile(summary.left, thisMonth, end, endSub, now),
  ];
}

/** The one thing that needs the owner, or null. A price to approve has its own banner and wins over
 *  everything but a due payment. */
export function usageNotice(s: UsageStanding, thisMonth: UsageOverview, now: Date = new Date()): UsageNotice | null {
  const pace = dailyPace(thisMonth);
  if (s.mode === "managed") {
    if (s.limit === null || s.limit <= 0) return null;
    const left = Math.max(0, s.limit - thisMonth.total);
    const share = thisMonth.total / s.limit;
    const resets = dayOf(new Date(thisMonth.to));
    if (share >= 1) return { tone: "bad", title: "This month's credits are used up", body: `AI runs are paused until the limit starts again on ${resets}. Ask Yuvabe if you need more.`, action: null };
    if (share >= 0.8) return { tone: "warn", title: `${Math.floor(share * 100)}% of this month's credits used`, body: `${n(left)} left until the limit starts again on ${resets}. Ask Yuvabe if you need more.`, action: null };
    return null;
  }

  const { summary, plan, planRunning } = s;
  if (plan?.status === "payment_due") {
    const deadline = plan.paymentDueSince ? ` If it isn't paid by ${dayOf(new Date(new Date(plan.paymentDueSince).getTime() + PAYMENT_DUE_END_DAYS * DAY_MS))}, the plan ends.` : "";
    const amount = plan.amountMinor !== null ? `${formatRupees(withGst(plan.amountMinor))} for ${plan.planName ?? "your plan"} is due. ` : "";
    return { tone: "bad", title: "Your payment didn't go through, so AI runs are paused", body: `${amount}Pay with the same card or another way; runs start again as soon as it goes through. Nothing is lost.${deadline}`, action: "pay" };
  }
  if (summary.state === "no_plan") return { tone: "warn", title: "No credits right now", body: "Pick a plan to start AI runs again. Its credits are added as soon as the payment goes through.", action: "plans" };
  if (summary.state === "free" && summary.freeEndsAt) {
    return { tone: "warn", title: `Your free credits end on ${lastDay(summary.freeEndsAt)}`, body: `${n(summary.freeLeft)} left. Pick a plan to keep making things after that. Its credits are added on top.`, action: "plans" };
  }
  if (summary.state === "used_up") {
    return { tone: "bad", title: "Your credits are used up", body: planRunning ? "AI runs are paused. Top up to keep going until your plan renews." : "AI runs are paused until your plan renews.", action: planRunning ? "top_up" : null };
  }
  const out = runOutAt(summary.left, pace, now);
  const end = plan?.endsAt ?? null;
  const early = !!out && !!end && out.getTime() < new Date(end).getTime();
  if (summary.state === "low" || early) {
    const when = early && out ? ` At this week's pace they run out around ${dayOf(out)}, before your plan ${plan?.status === "cancelling" ? "ends" : "renews"} on ${dayOf(new Date(end!))}.` : "";
    return { tone: "warn", title: "Credits are running low", body: `${n(summary.left)} left.${when}`, action: planRunning ? "top_up" : null };
  }
  return null;
}
