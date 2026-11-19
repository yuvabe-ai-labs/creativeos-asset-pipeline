// Finds background jobs whose run has ended without recording it (D483). A run killed for memory
// dies before it can mark its job failed, so the job stayed "running" (and the import spinner on)
// until someone happened to open that client's imports 45 minutes later.
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { forEachLimited } from "@/lib/for-each-limited";
import { JOB_STOPPED_MESSAGE, type JobKind } from "./types";

/** Kinds whose run always writes its own ending, so a live job after its run ended means the run died. */
export const RECONCILED_JOB_KINDS: JobKind[] = ["asset-import", "image-analysis", "kb-propose"];

/** Trigger.dev run statuses after which a run never writes again. */
const RUN_ENDED = new Set(["COMPLETED", "CANCELED", "FAILED", "CRASHED", "SYSTEM_FAILURE", "EXPIRED", "TIMED_OUT"]);

/** A run Trigger.dev no longer knows of is given up on only after this long. A run that has ended
 *  is acted on at once, however young its job: a run that fails before its code loads (Trigger.dev's
 *  own SYSTEM_FAILURE) dies within seconds and never marks its job. */
const MISSING_AFTER_MS = 45 * 60_000;
/** Jobs read per sweep, and run lookups made at once. */
const SWEEP_LIMIT = 200;
const LOOKUP_CONCURRENCY = 5;

/** A run's status, or null when Trigger.dev has no such run. Throws when it cannot tell. */
export type RunStatusLookup = (runId: string) => Promise<string | null>;

type LiveJob = { id: string; client_id: string | null; kind: JobKind; input: unknown; trigger_run_id: string; created_at: string };

/** Told about each job the sweep failed, so its feature can say so (D506). */
export type OnJobFailed = (job: Pick<LiveJob, "client_id" | "kind" | "input">) => Promise<void>;

export async function reconcileDeadJobs(
  lookup: RunStatusLookup,
  now: Date = new Date(),
  onFailed?: OnJobFailed,
): Promise<{ checked: number; failed: string[] }> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("background_jobs")
    .select("id, client_id, kind, input, trigger_run_id, created_at")
    .in("kind", RECONCILED_JOB_KINDS)
    .in("status", ["queued", "running"])
    .not("trigger_run_id", "is", null)
    .limit(SWEEP_LIMIT);
  if (error) throw error;
  const jobs = (data ?? []) as LiveJob[];

  const failed: string[] = [];
  await forEachLimited(jobs, LOOKUP_CONCURRENCY, async (job) => {
    let status: string | null;
    try {
      status = await lookup(job.trigger_run_id);
    } catch (e) {
      // A lookup that failed says nothing about the run, so the job is left as it is.
      console.error("[jobs/reconcile] could not read the run", { jobId: job.id, error: String(e) });
      return;
    }
    const age = now.getTime() - new Date(job.created_at).getTime();
    const dead = status === null ? age > MISSING_AFTER_MS : RUN_ENDED.has(status);
    if (!dead) return;

    // Only a job still live is changed: one whose run finished a moment ago keeps its result.
    const { data: changed, error: updateError } = await supabase
      .from("background_jobs")
      .update({ status: "failed", error: JOB_STOPPED_MESSAGE, finished_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("id", job.id)
      .in("status", ["queued", "running"])
      .select("id");
    if (updateError) {
      console.error("[jobs/reconcile] could not mark the job failed", { jobId: job.id, error: updateError.message });
      return;
    }
    if (!changed || changed.length === 0) return;
    failed.push(job.id);
    try {
      await onFailed?.({ client_id: job.client_id, kind: job.kind, input: job.input });
    } catch (e) {
      // The job is failed either way; one line that could not be said never stops the sweep.
      console.error("[jobs/reconcile] could not report the failed job", { jobId: job.id, error: String(e) });
    }
  });
  return { checked: jobs.length, failed };
}
