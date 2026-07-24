import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { GenerationRow } from "./types";

export async function insertGeneration(input: {
  nodeId: string;
  orgId: string;
  clientId?: string;
  userId?: string;
  userEmail?: string | null;
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
      org_id: input.orgId,
      client_id: input.clientId ?? null,
      user_id: input.userId ?? null,
      // Lightweight snapshot for support/debugging — who kicked this off, captured once
      // at creation. Not overwritten later: succeedGeneration only touches `meta` when
      // explicitly given a value, so this survives completion.
      meta: input.userEmail ? { email: input.userEmail } : null,
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
  costUsd?: number;
  outputSnapshot?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServerSupabase();
  const update: Record<string, unknown> = {
    status: "succeeded",
    version_id: input.versionId,
    cost_usd: input.costUsd ?? null,
    updated_at: new Date().toISOString(),
  };
  if (input.outputSnapshot !== undefined) update.output_snapshot = input.outputSnapshot;
  // Only touch meta when explicitly given a new value — insertGeneration already set it
  // (e.g. the creator's email) and an unconditional overwrite here would silently wipe
  // that out on every completion, since most callers never pass meta.
  if (input.meta !== undefined) update.meta = input.meta;

  const { error } = await supabase
    .from("generations")
    .update(update)
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

export async function countGenerationsForOrg(orgId: string): Promise<number> {
  const supabase = createServerSupabase();
  const { count, error } = await supabase
    .from("generations")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (error) throw error;
  return count ?? 0;
}

export type GenerationForOrgList = GenerationRow & { client_name: string | null };

export async function listGenerationsForOrg(
  orgId: string,
  limit = 100,
): Promise<GenerationForOrgList[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .select("*, clients(name)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as (GenerationRow & { clients: { name: string } | null })[]).map(
    ({ clients, ...g }) => ({ ...g, client_name: clients?.name ?? null }),
  );
}
