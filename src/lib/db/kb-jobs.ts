import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ClientKBJobRow, ClientKBJobStatus } from "./types";

export async function insertKBJob(input: {
  clientId: string;
  orgId: string;
  websiteUrl: string | null;
  docIdsUsed: string[];
}): Promise<ClientKBJobRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_kb_jobs")
    .insert({
      client_id: input.clientId,
      org_id: input.orgId,
      website_url: input.websiteUrl,
      doc_ids_used: input.docIdsUsed,
      status: "queued",
    })
    .select()
    .single();
  if (error) throw error;
  return data as ClientKBJobRow;
}

export async function getKBJob(jobId: string): Promise<ClientKBJobRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_kb_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  return (data as ClientKBJobRow) ?? null;
}

export async function getLatestKBJob(
  clientId: string,
): Promise<ClientKBJobRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_kb_jobs")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ClientKBJobRow) ?? null;
}

export async function updateKBJobPhase(input: {
  jobId: string;
  status: ClientKBJobStatus;
  phaseMessage: string;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("client_kb_jobs")
    .update({
      status: input.status,
      phase_message: input.phaseMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.jobId);
  if (error) throw error;
}

export async function setKBJobTriggerRunId(
  jobId: string,
  triggerRunId: string,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("client_kb_jobs")
    .update({ trigger_run_id: triggerRunId })
    .eq("id", jobId);
  if (error) throw error;
}

export async function markKBJobSucceeded(input: {
  jobId: string;
  versionId: string;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("client_kb_jobs")
    .update({
      status: "succeeded",
      version_id: input.versionId,
      phase_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.jobId);
  if (error) throw error;
}

export async function markKBJobFailed(input: {
  jobId: string;
  error: string;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error: dbError } = await supabase
    .from("client_kb_jobs")
    .update({
      status: "failed",
      error: input.error,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.jobId);
  if (dbError) throw dbError;
}

// Idempotent stuck-job cleanup — only marks failed if not already terminal.
export async function markKBJobStuckIfRunning(jobId: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("client_kb_jobs")
    .update({
      status: "failed",
      error: "Stuck — manually cleared",
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .not("status", "in", '("succeeded","failed")');
  if (error) throw error;
}
