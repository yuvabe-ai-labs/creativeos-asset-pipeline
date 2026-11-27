// The periods the Usage page offers (D583, D597): calendar months in India time.

export type UsagePeriod = "this_month" | "last_month";
/** What a group of runs is grouped by: who, where, which model or which kind of work. */
export type UsageBy = "member" | "client" | "canvas" | "model" | "kind";

export const USAGE_PERIODS: readonly UsagePeriod[] = ["this_month", "last_month"];
export const USAGE_BY: readonly UsageBy[] = ["member", "client", "canvas", "model", "kind"];

export const USAGE_PERIOD_LABEL: Record<UsagePeriod, string> = { this_month: "This month", last_month: "Last month" };

const IST_MS = 5.5 * 60 * 60 * 1000;

function monthRange(back: number, now: Date): { from: string; to: string } {
  const ist = new Date(now.getTime() + IST_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth() - back;
  const start = Date.UTC(y, m, 1) - IST_MS;
  const end = Date.UTC(y, m + 1, 1) - IST_MS;
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}

/** The month's start and the next month's start, both at 00:00 India time, as ISO. */
export function usageRange(period: UsagePeriod, now: Date = new Date()): { from: string; to: string } {
  return monthRange(period === "last_month" ? 1 : 0, now);
}

/** The month before the period, for "against last month". */
export function previousRange(period: UsagePeriod, now: Date = new Date()): { from: string; to: string } {
  return monthRange(period === "last_month" ? 2 : 1, now);
}

export function isUsagePeriod(v: unknown): v is UsagePeriod {
  return (USAGE_PERIODS as readonly unknown[]).includes(v);
}

export function isUsageBy(v: unknown): v is UsageBy {
  return (USAGE_BY as readonly unknown[]).includes(v);
}
