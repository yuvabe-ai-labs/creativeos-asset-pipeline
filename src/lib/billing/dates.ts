// Credits end on days, in India time: a chosen day works until its midnight (+05:30). Stored as
// the next day 00:00 IST; screens show the day itself. Spec 2026-11-20-admin-agency-billing-design.md.

const IST_MS = 5.5 * 60 * 60 * 1000;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `YYYY-MM-DD` and a real calendar day. */
export function isDay(value: string): boolean {
  const m = DAY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** When credits that work through `day` end: the next day at 00:00 India time, as ISO. */
export function endsAtFromDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1) - IST_MS).toISOString();
}

/** The last day credits ending at `endsAt` work, in India time. */
export function lastDayOf(endsAt: string): string {
  return new Date(new Date(endsAt).getTime() + IST_MS - 1).toISOString().slice(0, 10);
}

/** Today in India. */
export function todayIst(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_MS).toISOString().slice(0, 10);
}

/** `3 Dec 2026`. */
export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
