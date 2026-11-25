// Admins type and read dates and times in IST; UTC is shown small beside them, for matching vendor
// notices. IST is UTC+05:30 all year (no daylight saving), so plain offset maths is exact. Client-safe.

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n: number) => String(n).padStart(2, "0");

/** A typed IST time as "HH:MM": "8", "8:00", "08:00", "0800", "8.30", "8 pm", "20:00". Null when it isn't a time. */
export function parseIstTime(typed: string): string | null {
  const s = typed.trim().toLowerCase().replace(/\s+/g, "");
  const m = /^(\d{1,2})(?:[:.]?(\d{2}))?(am|pm)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    if (m[3] === "pm" && h < 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
  }
  if (h > 23 || min > 59) return null;
  return `${pad2(h)}:${pad2(min)}`;
}

/** The instant an IST date ("YYYY-MM-DD") and time ("HH:MM") name. Null when either doesn't exist. */
export function istInstant(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [y, mo, day, h, min] = [d[1], d[2], d[3], t[1], t[2]].map(Number);
  if (h > 23 || min > 59) return null;
  const asUtc = Date.UTC(y, mo - 1, day, h, min);
  const check = new Date(asUtc);
  // Date.UTC rolls 30 Feb over into March; a date that moved did not exist.
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== day) return null;
  return new Date(asUtc - IST_OFFSET_MS);
}

/** The instant as IST wall-clock parts (month 0-based). */
export function istParts(at: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const d = new Date(at.getTime() + IST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

/** The IST calendar date, "YYYY-MM-DD". */
export function istDate(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The IST wall-clock time, "HH:MM". */
export function istTime(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(11, 16);
}

/** "24 Nov 2026", or "24 Nov" without the year. */
export function formatIstDate(at: Date, withYear = true): string {
  const p = istParts(at);
  return `${p.day} ${MONTHS[p.month]}${withYear ? ` ${p.year}` : ""}`;
}

/** "08:00 IST". */
export function formatIstTime(at: Date): string {
  return `${istTime(at)} IST`;
}

/** "24 Nov 2026, 08:00 IST". */
export function formatIstWhen(at: Date): string {
  return `${formatIstDate(at)}, ${formatIstTime(at)}`;
}

/** The same moment in UTC, shown under the IST time: "02:30 UTC", or "18:30 UTC on 24 Nov" when the UTC day differs. */
export function formatUtcBeside(at: Date): string {
  const iso = at.toISOString();
  const sameDay = iso.slice(0, 10) === istDate(at);
  return `${iso.slice(11, 16)} UTC${sameDay ? "" : ` on ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`}`;
}

/** Today's IST date, "YYYY-MM-DD". */
export function todayIst(now: Date): string {
  return istDate(now);
}

/** An IST date moved by whole days. */
export function addIstDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Tomorrow 00:00 IST: the start the date picker offers first. */
export function tomorrowMidnightIst(now: Date): Date {
  const at = istInstant(addIstDays(todayIst(now), 1), "00:00");
  if (!at) throw new Error("tomorrow in IST is not a date");
  return at;
}

/** "today", "tomorrow", "in 4 days", "yesterday", "4 days ago", by IST calendar day. */
export function relativeIstDay(at: Date, now: Date): string {
  const days = Math.round((Date.parse(`${istDate(at)}T00:00:00Z`) - Date.parse(`${istDate(now)}T00:00:00Z`)) / DAY_MS);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1) return `in ${days} days`;
  if (days === -1) return "yesterday";
  return `${-days} days ago`;
}
