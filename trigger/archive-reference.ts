// trigger/archive-reference.ts
// Downloads the real media for one market reference and re-hosts it to GCS (D264).
//
// Every @/lib import is dynamic — those modules carry `import "server-only"`, a
// Next.js sentinel Trigger.dev's separate build must not evaluate statically (see
// reconcile-stuck-generations.ts).
//
// Imports from "@trigger.dev/sdk", not the deprecated "@trigger.dev/sdk/v3" alias the
// older tasks in this folder still use.
//
// Modelled on snapshot-handles rather than video-generate: it writes STRAIGHT to
// Supabase and GCS with no webhook. That is simpler, and it is also why this task
// completes when run from a dev machine — a callback to a localhost APP_URL does not.
import { task, logger } from "@trigger.dev/sdk";

export const archiveReferenceTask = task({
  id: "archive-reference",
  // A reel measured ~4 MB and a Short ~0.85 MB, but the provider call itself is the
  // slow part (17-38s observed), and a cold Apify actor can be slower still.
  maxDuration: 600,
  run: async (payload: { itemId: string; clientId: string }) => {
    const { archiveItem } = await import("@/lib/market/archive");

    const result = await archiveItem(payload.itemId, payload.clientId);

    // archiveItem never throws for a provider failure — it records the reason on the
    // row. Surfacing it at warn level keeps a bad reel visible in the dashboard
    // without failing the run and burning a retry on something that will not recover.
    if (!result.ok) {
      logger.warn("Archive failed", { ...payload, reason: result.reason });
    } else {
      logger.info("Archive finished", { ...payload, ...result });
    }
    return result;
  },
});
