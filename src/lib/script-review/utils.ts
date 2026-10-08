// src/lib/script-review/utils.ts
import type { ScriptComment } from "./types";

// The team and its clients are in India; a fixed zone makes the server-rendered HTML and the
// browser agree on the day, whatever zone the server runs in.
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const DAY_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata",
});

/** "10 Oct", as the board's "Version 2 · shared 10 Oct". */
export const formatShortDay = (iso: string) => DAY.format(new Date(iso));
/** "10 Oct, 14:05", for comments and activity lines. */
export const formatDayTime = (iso: string) => DAY_TIME.format(new Date(iso));

/** A comment the server returned, in the list at once: added, or replacing its older copy. */
export function upsertComment(comments: ScriptComment[], comment: ScriptComment): ScriptComment[] {
  return comments.some((c) => c.id === comment.id)
    ? comments.map((c) => (c.id === comment.id ? comment : c))
    : [...comments, comment];
}
