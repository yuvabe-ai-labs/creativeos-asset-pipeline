// trigger/reconcile-background-jobs.ts
// Marks a background job failed when its run has ended without recording it, such as a run
// killed for memory (D483). The @/lib import is dynamic for the reason given in
// reconcile-stuck-generations.ts.
import { logger, runs, schedules } from "@trigger.dev/sdk";

export const reconcileBackgroundJobsTask = schedules.task({
  id: "reconcile-background-jobs",
  // Often enough that a run which died is cleared from the screen within minutes, not a quarter-hour.
  cron: "*/5 * * * *",
  // A few database reads and API calls: the smallest machine is plenty.
  machine: "micro",
  run: async () => {
    const { reconcileDeadJobs } = await import("@/lib/jobs/reconcile");
    // A job that died is said once in the client's copilot thread (D518).
    const { sayJobFailed } = await import("@/lib/journey/kb-copilot/job-failed");
    const { checked, failed } = await reconcileDeadJobs(async (runId) => {
      try {
        return (await runs.retrieve(runId)).status;
      } catch (e) {
        if ((e as { status?: number }).status === 404) return null;
        throw e;
      }
    }, new Date(), sayJobFailed);
    if (failed.length > 0) logger.warn("Marked jobs whose run had ended as failed", { checked, failed });
    else logger.info("No dead jobs", { checked });
  },
});
