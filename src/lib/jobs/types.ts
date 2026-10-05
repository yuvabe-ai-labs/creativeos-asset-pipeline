// Generic background jobs (D306). The table holds a job's lifecycle only; what a job produces
// lives in its feature's own tables.

/**
 * Every kind of job there is. This union is the registry — the table deliberately has no check
 * constraint on `kind`, so adding one here is all a new long-running feature needs.
 */
export type JobKind = "asset-import";

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Statuses of a job that has not finished — the ones the one-live-job lock covers. */
export const JOB_LIVE_STATUSES: ReadonlySet<JobStatus> = new Set(["queued", "running"]);

/** A background_jobs row. `input` and `result` are typed by the feature that owns the kind. */
export type BackgroundJobRow<Input = Record<string, unknown>, Result = Record<string, unknown>> = {
  id: string;
  org_id: string;
  client_id: string | null;
  kind: JobKind;
  status: JobStatus;
  phase_message: string | null;
  input: Input;
  result: Result | null;
  error: string | null;
  lock_key: string | null;
  trigger_run_id: string | null;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
};

/** Thrown when a job's lock key already has a live job — e.g. a second Refresh mid-import. */
export class JobLockedError extends Error {
  constructor(public readonly lockKey: string) {
    super("That job is already running.");
    this.name = "JobLockedError";
  }
}
