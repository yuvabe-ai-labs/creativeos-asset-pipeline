// trigger/archive-sweep.ts
// One scheduled task doing three jobs at once (D264), which is why it earns its keep:
//
//   1. BACKFILL — every pre-existing row defaults to `pending`, so the first run picks
//      up the entire existing corpus with no separate migration script. On the current
//      shelf that is ~111 items, 62 of which have no thumbnail either (D265).
//   2. RETRY    — a transient provider failure gets another pass, up to
//      MAX_ARCHIVE_ATTEMPTS. This is the capability the capture-time ladder has never
//      had, and the reason those 62 favicon tiles are permanent today.
//   3. RECOVERY — a dropped tasks.trigger enqueue self-heals here, which is what lets
//      ingestReference treat the enqueue as fire-and-forget.
//
// Runs at 05:30, half an hour after snapshot-handles, so the two never contend for the
// same Apify rate limit.
//
// Every @/lib import is dynamic — those modules carry `import "server-only"`, which
// Trigger.dev's separate build must not evaluate statically.
import { schedules, logger } from "@trigger.dev/sdk";

// One batch per night. Deliberately modest: each item can cost an Apify call, and the
// backlog is finite — a few nights to drain the existing corpus is fine, whereas a
// runaway first run would be a surprise bill.
const BATCH_SIZE = 50;

export const archiveSweepTask = schedules.task({
  id: "archive-sweep",
  cron: "30 5 * * *",
  maxDuration: 1200,
  run: async () => {
    const { listArchivable, releaseStuckArchives } = await import("@/lib/db/moodboards");
    const { archiveItem } = await import("@/lib/market/archive");
    const { MAX_ARCHIVE_ATTEMPTS, STUCK_ARCHIVE_MINUTES } = await import(
      "@/lib/market/constants"
    );

    // Recover first, so anything a crashed run abandoned is eligible for this pass.
    const cutoff = new Date(Date.now() - STUCK_ARCHIVE_MINUTES * 60_000).toISOString();
    const released = await releaseStuckArchives(cutoff);
    if (released > 0) logger.info("Released abandoned archives", { released });

    const work = await listArchivable(BATCH_SIZE, MAX_ARCHIVE_ATTEMPTS);
    logger.info("Archive sweep starting", { count: work.length });

    let archived = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of work) {
      try {
        const result = await archiveItem(row.id, row.clientId);
        if (!result.ok) failed++;
        else if ("skipped" in result) skipped++;
        else archived++;
        logger.info("Archive done", { itemId: row.id, ...result });
      } catch (e) {
        // One bad item must not starve the rest — the same rule snapshot-handles uses,
        // and it matters more here because a single wedged provider call would
        // otherwise block the whole backlog behind it.
        failed++;
        logger.error("Archive threw", {
          itemId: row.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    logger.info("Archive sweep finished", { archived, skipped, failed });
    return { considered: work.length, archived, skipped, failed };
  },
});
