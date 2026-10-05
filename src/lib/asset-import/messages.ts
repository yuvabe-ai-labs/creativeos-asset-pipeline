// Everything an import says to the people using the app (D302) — progress, results, failures.
// Kept in one place so the wording stays plain and consistent, and so nothing technical (the
// scraping provider, HTTP codes, environment variables) ever reaches the screen: those details go
// to the server logs instead.
import { IMPORT_SOURCE_LABELS, SOCIAL_WINDOW_MONTHS, type ImportSource } from "./constants";

/** "2 Oct" — for a YYYY-MM-DD date. */
function shortDate(isoDay: string): string {
  return new Date(`${isoDay}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export const importCopy = {
  /** While the source is being read. */
  collecting(source: ImportSource, since: string | null): string {
    if (source === "website") return "Collecting images and videos from the website…";
    const label = IMPORT_SOURCE_LABELS[source];
    return since
      ? `Looking for new ${label} posts since ${shortDate(since)}…`
      : `Collecting the last ${SOCIAL_WINDOW_MONTHS} months of ${label} posts…`;
  },

  /** While the new assets are being stored. */
  adding(count: number): string {
    return count === 1 ? "Adding 1 new asset…" : `Adding ${count} new assets…`;
  },

  /** The one-line result of a finished import. */
  done(added: number, found: number): string {
    if (added > 0) return `${added} new`;
    return found > 0 ? "Already up to date" : "No new posts";
  },

  /** A refresh that found nothing newer than last time — a success, not a failure. */
  nothingNew: "No new posts",

  /** Anything that went wrong on our side or the provider's. The cause is in the server logs. */
  unavailable(source: ImportSource): string {
    return source === "website"
      ? "We couldn't load the website right now. Try again in a few minutes."
      : `We couldn't reach ${IMPORT_SOURCE_LABELS[source]} right now. Try again in a few minutes.`;
  },

  /** The background run could not be queued. */
  couldNotStart: "The import couldn't start. Try again.",
};
