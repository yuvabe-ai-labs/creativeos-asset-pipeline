// background_jobs reads and writes (D306) — the lifecycle every long-running job shares.
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { JobLockedError, type BackgroundJobRow, type JobKind } from "./types";

const TABLE = "background_jobs";

/** Creates a queued job. Throws JobLockedError when `lockKey` already has a live job. */
export async function insertJob<Input extends object>(args: {
  orgId: string;
  clientId: string | null;
  kind: JobKind;
  input: Input;
  lockKey?: string | null;
  phaseMessage?: string | null;
  createdBy?: string | null;
}): Promise<BackgroundJobRow<Input>> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      org_id: args.orgId,
      client_id: args.clientId,
      kind: args.kind,
      input: args.input,
      lock_key: args.lockKey ?? null,
      phase_message: args.phaseMessage ?? null,
      created_by: args.createdBy ?? null,
    })
    .select()
    .single();
  if (error) {
    // 23505 = unique violation on background_jobs_one_live_idx.
    if ((error as { code?: string }).code === "23505" && args.lockKey) throw new JobLockedError(args.lockKey);
    throw error;
  }
  return data as BackgroundJobRow<Input>;
}

export async function getJob<Input = Record<string, unknown>, Result = Record<string, unknown>>(
  jobId: string,
): Promise<BackgroundJobRow<Input, Result> | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", jobId).maybeSingle();
  if (error) throw error;
  return (data as BackgroundJobRow<Input, Result>) ?? null;
}

/** A client's most recent jobs of one kind, newest first. */
export async function listRecentJobs<Input = Record<string, unknown>, Result = Record<string, unknown>>(
  clientId: string,
  kind: JobKind,
  limit = 20,
): Promise<BackgroundJobRow<Input, Result>[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("client_id", clientId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as BackgroundJobRow<Input, Result>[];
}

async function patchJob(jobId: string, patch: Record<string, unknown>): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) throw error;
}

export const setJobRunId = (jobId: string, triggerRunId: string) =>
  patchJob(jobId, { trigger_run_id: triggerRunId });

export const startJob = (jobId: string, phaseMessage?: string) =>
  patchJob(jobId, { status: "running", started_at: new Date().toISOString(), phase_message: phaseMessage ?? null });

export const setJobPhase = (jobId: string, phaseMessage: string) =>
  patchJob(jobId, { phase_message: phaseMessage });

export const succeedJob = (jobId: string, result: object, phaseMessage?: string) =>
  patchJob(jobId, {
    status: "succeeded",
    result,
    error: null,
    phase_message: phaseMessage ?? null,
    finished_at: new Date().toISOString(),
  });

/**
 * Fails a client's live jobs of one kind that have outlived `maxAgeMs`. A run that died without
 * reporting (out of memory, a deploy mid-run) would otherwise hold its lock forever.
 */
export async function failStaleJobs(clientId: string, kind: JobKind, maxAgeMs: number): Promise<void> {
  const supabase = createServerSupabase();
  const now = new Date();
  const { error } = await supabase
    .from(TABLE)
    .update({ status: "failed", error: "This job stopped responding.", finished_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("client_id", clientId)
    .eq("kind", kind)
    .in("status", ["queued", "running"])
    .lt("created_at", new Date(now.getTime() - maxAgeMs).toISOString());
  if (error) throw error;
}

export const failJob = (jobId: string, error: string) =>
  patchJob(jobId, { status: "failed", error, finished_at: new Date().toISOString() });
