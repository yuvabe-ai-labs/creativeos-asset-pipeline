// Pure relative-time formatter. `now` is injectable so tests are deterministic.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function formatRelativeTime(
  iso: string | null,
  now: Date = new Date(),
): string {
  if (!iso) return "—";
  const then = new Date(iso);
  const ms = then.getTime();
  if (Number.isNaN(ms)) return "—";

  const diff = now.getTime() - ms;
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 2 * DAY) return "yesterday";
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d ago`;
  if (diff < 5 * WEEK) return `${Math.floor(diff / WEEK)}w ago`;

  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
