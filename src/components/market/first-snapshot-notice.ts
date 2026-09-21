import type { FirstSnapshotOutcome } from "@/lib/market/performance";

/**
 * Toast copy for a non-ok first snapshot (D275). Pure and separate from the dialog so
 * the copy is testable without rendering. In both non-ok cases the handle IS tracked —
 * the dialog closes and the sub-tab opens on its "First snapshot pending" state, which
 * is where the Refresh the copy points at lives.
 */
export function firstSnapshotNotice(handle: string, snapshot: FirstSnapshotOutcome): string | null {
  if (snapshot === "ok") return null;
  if (snapshot === "no-data") {
    return `Instagram returned no data for @${handle} — private or misspelled? Use Refresh to try again.`;
  }
  return `Tracked @${handle}, but the first snapshot failed. Use Refresh to try again.`;
}
