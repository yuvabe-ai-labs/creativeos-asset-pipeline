// trigger/snapshot-handles.ts
// Daily Instagram performance sweep (D235). Every @/lib import is dynamic — those
// modules carry `import "server-only"`, a Next.js sentinel Trigger.dev's separate
// build must not evaluate statically (see reconcile-stuck-generations.ts).
//
// Imports from "@trigger.dev/sdk", not the deprecated "@trigger.dev/sdk/v3" alias the
// older tasks in this folder still use — the installed SDK's own authoring skill
// (node_modules/@trigger.dev/sdk/skills/trigger-authoring-tasks) calls /v3 deprecated.
import { schedules, logger } from "@trigger.dev/sdk";

export const snapshotHandlesTask = schedules.task({
  id: "snapshot-handles",
  cron: "0 5 * * *",
  run: async () => {
    const { listAllTrackedHandles } = await import("@/lib/db/performance");
    const { snapshotHandle } = await import("@/lib/market/snapshot");

    // The work list IS the enrolment table (D252) — no Brand Kit read, no per-client
    // toggle. Adding a handle on the Market page is what enrols it here.
    const tracked = await listAllTrackedHandles();
    logger.info("Handle sweep starting", { count: tracked.length });

    for (const row of tracked) {
      try {
        const result = await snapshotHandle(row.clientId, row.handle);
        logger.info("Snapshot done", { clientId: row.clientId, handle: row.handle, ...result });
      } catch (e) {
        // One bad handle must not starve the rest — log and continue (spec §3). This
        // matters more now that handles include competitors: one can go private or
        // vanish without anyone on the team noticing.
        logger.error("Snapshot failed", {
          clientId: row.clientId,
          handle: row.handle,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  },
});
