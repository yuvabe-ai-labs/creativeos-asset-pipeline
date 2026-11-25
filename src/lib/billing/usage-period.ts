// The periods "who used what" offers (D583): calendar months in India time.

export type UsagePeriod = "this_month" | "last_month";
export type UsageBy = "member" | "client" | "canvas";

export const USAGE_PERIODS: readonly UsagePeriod[] = ["this_month", "last_month"];
export const USAGE_BY: readonly UsageBy[] = ["member", "client", "canvas"];

const IST_MS = 5.5 * 60 * 60 * 1000;

/** The month's start and the next month's start, both at 00:00 India time, as ISO. */
export function usageRange(period: UsagePeriod, now: Date = new Date()): { from: string; to: string } {
  const ist = new Date(now.getTime() + IST_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth() - (period === "last_month" ? 1 : 0);
  const start = Date.UTC(y, m, 1) - IST_MS;
  const end = Date.UTC(y, m + 1, 1) - IST_MS;
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}

export function isUsagePeriod(v: unknown): v is UsagePeriod {
  return (USAGE_PERIODS as readonly unknown[]).includes(v);
}

export function isUsageBy(v: unknown): v is UsageBy {
  return (USAGE_BY as readonly unknown[]).includes(v);
}
