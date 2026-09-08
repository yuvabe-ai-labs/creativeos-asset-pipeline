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
    const { listClientsWithInstagramHandle } = await import("@/lib/db/performance");
    const { snapshotClientHandle } = await import("@/lib/market/snapshot");

    const clients = await listClientsWithInstagramHandle();
    logger.info("Handle sweep starting", { count: clients.length });

    for (const client of clients) {
      try {
        const result = await snapshotClientHandle(client.id);
        logger.info("Snapshot done", { clientId: client.id, ...result });
      } catch (e) {
        // One bad handle must not starve the rest — log and continue (spec §3).
        logger.error("Snapshot failed", {
          clientId: client.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  },
});
