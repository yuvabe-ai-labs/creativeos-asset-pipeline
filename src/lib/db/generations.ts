import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { GenerationRow } from "./types";

export async function insertGeneration(input: {
  nodeId: string;
  type: GenerationRow["type"];
  modelUsed?: string;
  paramsSnapshot?: Record<string, unknown>;
  inputsSnapshot?: Record<string, unknown>;
}): Promise<GenerationRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .insert({
      node_id: input.nodeId,
      type: input.type,
      status: "running",
      model_used: input.modelUsed ?? null,
      params_snapshot: input.paramsSnapshot ?? {},
      inputs_snapshot: input.inputsSnapshot ?? {},
    })
    .select()
    .single();
  if (error) throw error;
  return data as GenerationRow;
}

export async function succeedGeneration(input: {
  generationId: string;
  versionId: string;
  creditsConsumed?: number;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("generations")
    .update({
      status: "succeeded",
      version_id: input.versionId,
      credits_consumed: input.creditsConsumed ?? null,
      meta: input.meta ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.generationId);
  if (error) throw error;
}

export async function failGeneration(input: {
  generationId: string;
  error: string;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("generations")
    .update({
      status: "failed",
      error: input.error,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.generationId);
  if (error) throw error;
}

export async function getGeneration(id: string): Promise<GenerationRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as GenerationRow;
}

export async function listGenerations(nodeId: string): Promise<GenerationRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .eq("node_id", nodeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GenerationRow[];
}

export async function getGenerationByProviderJobId(
  providerJobId: string,
): Promise<GenerationRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .eq("provider_job_id", providerJobId)
    .single();
  if (error) return null;
  return data as GenerationRow;
}

export async function setProviderJobId(
  generationId: string,
  providerJobId: string,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("generations")
    .update({ provider_job_id: providerJobId })
    .eq("id", generationId);
  if (error) throw error;
}
