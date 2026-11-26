import type { BillingMode, GrantKind, OpenGrant } from "@/lib/billing/grants";
import { LOW_CREDITS_SHARE, summarizeBilling } from "@/lib/billing/summary";
import { formatRelativeTime } from "@/lib/format/relative-time";

// Admin › Agencies (D590, prototype 2026-11-26-agencies-redesign-a-v3): each agency as one row with
// the one thing that most needs Yuvabe, its billing, its credits and its activity. The server builds
// the rows (with one `now`, so the page and the browser agree on every "N days ago"); the browser
// only searches, filters and sorts them.

const DAY = 24 * 60 * 60 * 1000;
/** An agency that has run before but not for this many days is quiet. */
export const QUIET_DAYS = 30;
/** The credits bar turns red from this share. */
const CREDITS_RED_PERCENT = 95;

export type LiveSubscriptionStatus = "created" | "active" | "payment_due" | "cancelling";

/** Everything the list reads about one agency, as the loader gathers it. */
export type AgencySource = {
  id: string;
  name: string;
  billingMode: BillingMode;
  monthlyLimit: number | null;
  clientCount: number;
  hasOwner: boolean;
  ownerInvite: { email: string; sentAt: string; expiresAt: string; link: string } | null;
  /** Null when it couldn't be read: shown as unknown, never as "never active". */
  activity: { ownerEmail: string | null; memberCount: number; lastRunAt: string | null } | null;
  creditsUsedThisMonth: number;
  grants: { kind: GrantKind; credits: number; used: number; endsAt: string }[];
  subscription: {
    status: LiveSubscriptionStatus;
    paymentDueSince: string | null;
    planName: string | null;
    intervalMonths: number | null;
  } | null;
};

export type Tone = "bad" | "warn" | "plain";

export type AgencyIssue = { tone: Tone; label: string; note: string };

/** The row's fix button, mapped to an action the app already has. */
export type AgencyFix =
  | { kind: "billing"; label: string; href: string }
  | { kind: "copy_invite"; link: string; email: string }
  | { kind: "resend_invite" }
  | { kind: "invite_owner" };

export type AgencyRow = {
  id: string;
  name: string;
  href: string;
  billingMode: BillingMode;
  /** Owner's login email, or the invited email; null when not known. */
  ownerEmail: string | null;
  /** The line under the name. */
  ownerLine: string;
  ownerJoined: boolean;
  issue: AgencyIssue | null;
  fix: AgencyFix | null;
  /** 0 bad, 1 warn, 2 plain, 3 nothing. */
  rank: number;
  billing: { tone: "plain" | "ok" | "warn" | "bad"; label: string; note: string; line: string };
  credits: {
    used: number;
    limit: number | null;
    percent: number | null;
    bar: "normal" | "warn" | "bad";
    /** Shown instead of a limit when there is none. */
    noLimit: string;
    tip: string;
    line: string;
  };
  activity: {
    /** False when the activity read failed. */
    known: boolean;
    lastActive: string;
    /** Days since the last run; null when it never ran or it isn't known. */
    days: number | null;
    size: string;
  };
  quiet: boolean;
};

const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const daysSince = (iso: string, now: Date) => Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY));
const daysUntil = (iso: string, now: Date) => Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY));
const ago = (days: number) => (days === 0 ? "today" : `${plural(days, "day", "days")} ago`);

/** Used as a whole percent of the limit, rounded down so 79.9% never reads as 80%. */
export function creditPercent(used: number, limit: number): number {
  if (limit <= 0) return 100;
  return Math.min(100, Math.max(0, Math.floor((used / limit) * 100)));
}

function renews(intervalMonths: number | null): string {
  if (intervalMonths === 12) return "Renews yearly";
  if (intervalMonths && intervalMonths > 1) return `Renews every ${intervalMonths} months`;
  return "Renews monthly";
}

function openGrants(a: AgencySource): OpenGrant[] {
  return a.grants.map((g, i) => ({ id: String(i), kind: g.kind, credits: g.credits, used: g.used, left: Math.max(0, g.credits - g.used), endsAt: g.endsAt }));
}

export function toAgencyRow(a: AgencySource, now: Date): AgencyRow {
  const href = `/admin/orgs/${a.id}`;
  const billingHref = `${href}?tab=billing`;
  const sub = a.subscription;
  const summary = a.billingMode === "plans" ? summarizeBilling("plans", openGrants(a), sub ? { status: sub.status, currentPeriodEnd: null } : null) : null;
  const paidPlan = !!sub && sub.status !== "created";
  const planName = sub?.planName ?? "Plan";

  // Credits: a managed agency's month against its limit; a paying agency's open credits.
  const used = summary ? summary.total - summary.left : a.creditsUsedThisMonth;
  const limit = summary ? (summary.total > 0 ? summary.total : null) : a.monthlyLimit;
  const percent = limit === null ? null : creditPercent(used, limit);
  const left = limit === null ? 0 : Math.max(0, limit - used);
  const noLimit = summary ? "No credits" : "Unlimited";
  const credits: AgencyRow["credits"] = {
    used,
    limit,
    percent,
    bar: percent === null ? "normal" : percent >= CREDITS_RED_PERCENT ? "bad" : percent >= LOW_CREDITS_SHARE * 100 ? "warn" : "normal",
    noLimit,
    tip:
      limit !== null
        ? `${fmt(used)} used, ${fmt(left)} left${summary ? "" : " this month"}.`
        : summary
          ? `No credits left. ${fmt(a.creditsUsedThisMonth)} used this month.`
          : `No monthly limit. ${fmt(used)} used this month.`,
    line: limit !== null ? `${fmt(used)} of ${fmt(limit)} credits used` : summary ? "No credits left" : `${fmt(used)} credits used, no limit`,
  };

  // Billing.
  let billing: AgencyRow["billing"];
  if (!summary) {
    billing = { tone: "plain", label: "Managed", note: a.monthlyLimit === null ? "Unlimited" : `${fmt(a.monthlyLimit)} a month`, line: "Managed" };
  } else if (sub?.status === "payment_due") {
    billing = { tone: "bad", label: `${planName} · payment due`, note: "Runs paused", line: `${planName} plan, payment due` };
  } else if (paidPlan) {
    billing = { tone: "ok", label: planName, note: sub!.status === "cancelling" ? "Won't renew" : renews(sub!.intervalMonths), line: `${planName} plan` };
  } else {
    billing = { tone: "warn", label: "No plan yet", note: summary.freeLeft > 0 ? "Free credits" : "No credits left", line: "No plan yet" };
  }

  // Owner.
  const invite = a.ownerInvite;
  const ownerJoined = a.hasOwner;
  const ownerEmail = ownerJoined ? (a.activity?.ownerEmail ?? null) : (invite?.email ?? null);
  const ownerLine = ownerJoined ? (ownerEmail ?? "—") : invite ? `${invite.email} · not joined` : "No owner";
  const inviteExpired = !!invite && new Date(invite.expiresAt).getTime() <= now.getTime();

  // Activity.
  const known = a.activity !== null;
  const lastRunAt = a.activity?.lastRunAt ?? null;
  const days = lastRunAt ? daysSince(lastRunAt, now) : null;
  const quiet = days !== null && days >= QUIET_DAYS;
  const members = a.activity?.memberCount ?? null;
  const clientsText = a.clientCount ? plural(a.clientCount, "client", "clients") : "No clients";
  const activity: AgencyRow["activity"] = {
    known,
    lastActive: !known ? "—" : lastRunAt ? formatRelativeTime(lastRunAt, now) : "Never",
    days,
    size: members === null ? clientsText : `${clientsText} · ${members ? plural(members, "person", "people") : "no one yet"}`,
  };

  // The one issue, most urgent first.
  let issue: AgencyIssue | null = null;
  let fix: AgencyFix | null = null;
  if (sub?.status === "payment_due") {
    issue = { tone: "bad", label: "Payment due", note: sub.paymentDueSince ? `Renewal failed ${ago(daysSince(sub.paymentDueSince, now))}` : "Renewal failed" };
    fix = { kind: "billing", label: "Open billing", href: billingHref };
  } else if (!ownerJoined && invite) {
    issue = inviteExpired
      ? { tone: "warn", label: "Owner hasn't joined", note: `Invite link expired, sent ${ago(daysSince(invite.sentAt, now))}` }
      : { tone: "warn", label: "Owner hasn't joined", note: `Invited ${ago(daysSince(invite.sentAt, now))}` };
    fix = inviteExpired ? { kind: "resend_invite" } : { kind: "copy_invite", link: invite.link, email: invite.email };
  } else if (!ownerJoined) {
    issue = { tone: "warn", label: "No owner", note: "No one invited yet" };
    fix = { kind: "invite_owner" };
  } else if (summary?.state === "free" && summary.freeEndsAt) {
    const n = daysUntil(summary.freeEndsAt, now);
    issue = { tone: "warn", label: n === 0 ? "Free credits end today" : `Free credits end in ${plural(n, "day", "days")}`, note: "No plan picked yet" };
    fix = { kind: "billing", label: "Open billing", href: billingHref };
  } else if (percent !== null && percent >= LOW_CREDITS_SHARE * 100) {
    issue = { tone: "warn", label: `${percent}% of credits used`, note: `${fmt(left)} left${summary ? "" : " this month"}` };
    fix = { kind: "billing", label: summary ? "Add credits" : "Raise limit", href: billingHref };
  } else if (quiet) {
    issue = { tone: "plain", label: `Quiet for ${QUIET_DAYS}+ days`, note: `No runs for ${days} days` };
  }

  return {
    id: a.id,
    name: a.name,
    href,
    billingMode: a.billingMode,
    ownerEmail,
    ownerLine,
    ownerJoined,
    issue,
    fix,
    rank: !issue ? 3 : issue.tone === "bad" ? 0 : issue.tone === "warn" ? 1 : 2,
    billing,
    credits,
    activity,
    quiet,
  };
}

// Filters: the chips, with counts that follow the search.
export const AGENCY_FILTERS = [
  { key: "all", label: "All", test: () => true },
  { key: "attention", label: "Needs attention", test: (r: AgencyRow) => r.rank < 2 },
  { key: "plan", label: "Pays for a plan", test: (r: AgencyRow) => r.billingMode === "plans" },
  { key: "managed", label: "Managed", test: (r: AgencyRow) => r.billingMode === "managed" },
  { key: "notjoined", label: "Owner not joined", test: (r: AgencyRow) => !r.ownerJoined },
  { key: "quiet", label: `Quiet ${QUIET_DAYS}+ days`, test: (r: AgencyRow) => r.quiet },
] as const;
export type AgencyFilter = (typeof AGENCY_FILTERS)[number]["key"];

export function searchAgencies(rows: AgencyRow[], query: string): AgencyRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.name.toLowerCase().includes(q) || (r.ownerEmail ?? "").toLowerCase().includes(q));
}

export function filterCounts(rows: AgencyRow[]): Record<AgencyFilter, number> {
  return Object.fromEntries(AGENCY_FILTERS.map((f) => [f.key, rows.filter(f.test).length])) as Record<AgencyFilter, number>;
}

// Sorting. `dir: 1` is each column's natural order; a second click flips it (not Needs attention).
export type AgencySortKey = "attention" | "name" | "credits" | "active";
export type AgencySort = { key: AgencySortKey; dir: 1 | -1 };
export const DEFAULT_AGENCY_SORT: AgencySort = { key: "attention", dir: 1 };

/** Days since the last run, with never-ran and unknown after every real value. */
const activeDays = (r: AgencyRow) => r.activity.days ?? Number.POSITIVE_INFINITY;
const neverActive = (r: AgencyRow) => r.activity.days === null;
const byNumber = (x: number, y: number) => (x === y ? 0 : x < y ? -1 : 1);

const SORTS: Record<AgencySortKey, { cmp: (a: AgencyRow, b: AgencyRow) => number; flips: boolean; ascending: boolean; neverLast?: boolean }> = {
  attention: { cmp: (a, b) => a.rank - b.rank || byNumber(activeDays(a), activeDays(b)) || a.name.localeCompare(b.name), flips: false, ascending: true },
  name: { cmp: (a, b) => a.name.localeCompare(b.name) || (a.ownerEmail ?? "").localeCompare(b.ownerEmail ?? ""), flips: true, ascending: true },
  credits: { cmp: (a, b) => byNumber(b.credits.used, a.credits.used), flips: true, ascending: false },
  active: { cmp: (a, b) => byNumber(activeDays(a), activeDays(b)), flips: true, ascending: false, neverLast: true },
};

export function nextSort(current: AgencySort, key: AgencySortKey): AgencySort {
  if (current.key !== key) return { key, dir: 1 };
  return SORTS[key].flips ? { key, dir: current.dir === 1 ? -1 : 1 } : current;
}

/** The header's aria-sort for a column. */
export function ariaSort(current: AgencySort, key: AgencySortKey): "none" | "other" | "ascending" | "descending" {
  if (current.key !== key) return "none";
  const s = SORTS[key];
  if (!s.flips) return "other";
  const ascending = s.ascending ? current.dir === 1 : current.dir === -1;
  return ascending ? "ascending" : "descending";
}

export function sortAgencies(rows: AgencyRow[], sort: AgencySort): AgencyRow[] {
  const s = SORTS[sort.key];
  return [...rows].sort((a, b) => {
    if (s.neverLast && neverActive(a) !== neverActive(b)) return neverActive(a) ? 1 : -1;
    return s.cmp(a, b) * sort.dir;
  });
}

/** The rows shown: searched, filtered, sorted. */
export function visibleAgencies(rows: AgencyRow[], query: string, filter: AgencyFilter, sort: AgencySort): AgencyRow[] {
  const test = AGENCY_FILTERS.find((f) => f.key === filter)?.test ?? (() => true);
  return sortAgencies(searchAgencies(rows, query).filter(test), sort);
}

/** The footer: "All 17 agencies" or "4 of 17 agencies". */
export function countLine(shown: number, total: number): string {
  const all = plural(total, "agency", "agencies");
  return shown === total ? `All ${all}` : `${shown} of ${all}`;
}
