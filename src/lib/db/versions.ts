import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { NodeVersionRow } from "./types";

// The version log (append-only) + the active-pointer move. Shared by every
// node type's writeVersion/setActive step.

export async function insertVersion(input: {
  nodeId: string;
  inputsUsed?: Record<string, unknown>;
  paramsUsed?: Record<string, unknown>;
  modelUsed?: string | null;
  output?: unknown;
  error?: string | null;
  note?: string | null;
  operator?: string | null;
}): Promise<NodeVersionRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("node_versions")
    .insert({
      node_id: input.nodeId,
      inputs_used: input.inputsUsed ?? {},
      params_used: input.paramsUsed ?? {},
      model_used: input.modelUsed ?? null,
      output: input.output ?? null,
      error: input.error ?? null,
      note: input.note ?? null,
      operator: input.operator ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as NodeVersionRow;
}

// Move the node's "current output" pointer (never mutates the log).
export async function setActiveVersion(
  nodeId: string,
  versionId: string,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("nodes")
    .update({ active_version_id: versionId })
    .eq("id", nodeId);
  if (error) throw error;
}

export async function listVersions(nodeId: string): Promise<NodeVersionRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("node_versions")
    .select("*")
    .eq("node_id", nodeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as NodeVersionRow[];
}
