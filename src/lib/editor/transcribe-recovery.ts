// A captions run whose Trigger.dev run died without reporting (D395). The task settles its own job
// when it runs, and onFailure when it throws, but a run that never gets an executor (a dev worker
// replaced by a rebuild, a crash, a run that expired in the queue) runs neither. Our job would then
// look live forever: the editor keeps "Listening…" and the one-run lock refuses every retry. So
// whoever reads a live job asks Trigger.dev about its run, and settles it here when the run is over.
import type { BackgroundJobRow } from "@/lib/jobs/types";
import type { TranscribeJobInput } from "./transcribe-plan";

export const RUN_STOPPED_MESSAGE = "Captions stopped before they finished. Your credits were returned.";

/** Run states that will never report back. COMPLETED is not here: a finished run settled itself. */
const DEAD = new Set(["SYSTEM_FAILURE", "CRASHED", "FAILED", "TIMED_OUT", "EXPIRED", "CANCELED"]);
const LIVE_JOB = new Set(["queued", "running"]);

type Deps = {
  retrieveRun(runId: string): Promise<{ status: string }>;
  failJob(jobId: string, message: string): Promise<unknown>;
  refund(a: { orgId: string; generationId: string }): Promise<unknown>;
  failGeneration(a: { generationId: string; error: string }): Promise<unknown>;
};

/** True when the job's run is over without reporting, and the job is now failed and refunded. */
export async function settleDeadTranscribeJob(job: BackgroundJobRow<TranscribeJobInput>, deps: Deps): Promise<boolean> {
  if (!LIVE_JOB.has(job.status) || !job.trigger_run_id) return false;
  let status: string;
  try {
    status = (await deps.retrieveRun(job.trigger_run_id)).status;
  } catch {
    return false; // can't tell: never treat an unreadable run as dead (rule 13)
  }
  if (!DEAD.has(status)) return false;
  await deps.failJob(job.id, RUN_STOPPED_MESSAGE);
  await deps.refund({ orgId: job.input.orgId, generationId: job.input.generationId });
  await deps.failGeneration({ generationId: job.input.generationId, error: `run ${status}` });
  return true;
}
