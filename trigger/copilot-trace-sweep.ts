// trigger/copilot-trace-sweep.ts
// Copilot turn traces are kept 30 days (D521, spec §3.3). Once a day, everything older goes. The
// Turns list also hides anything older, so a sweep that runs late never shows a stale trace.
//
// Every @/lib import is dynamic: those modules carry `import "server-only"`, which Trigger.dev's
// separate build must not evaluate statically (see archive-sweep.ts).
import { logger, schedules } from "@trigger.dev/sdk";

export const copilotTraceSweepTask = schedules.task({
  id: "copilot-trace-sweep",
  cron: "15 4 * * *",
  maxDuration: 300,
  run: async () => {
    const { deleteTurnTracesBefore } = await import("@/lib/db/copilot-traces");
    const { TRACE_KEEP_DAYS } = await import("@/lib/journey/kb-copilot/constants");
    const cutoff = new Date(Date.now() - TRACE_KEEP_DAYS * 86_400_000).toISOString();
    const removed = await deleteTurnTracesBefore(cutoff);
    logger.info("Removed old copilot turn traces", { removed, cutoff });
    return { removed };
  },
});
