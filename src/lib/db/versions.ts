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
  // R11.1: the MAKER, as a real user reference. `operator` above is the legacy free-text
  // column — never written for generated versions (historically it only ever held the
  // literal "duplicate"), kept only so pre-migration rows still read (R11.4).
  operatorUserId?: string | null;
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
      // D22: freeze the model's raw output. Written ONCE here, never touched by
      // updateActiveVersionOutput — so a later manual edit to `output` leaves this
      // intact, preserving the generated -> shipped diff. Null on failed attempts
      // (no generation happened).
      generated_output: input.output ?? null,
      error: input.error ?? null,
      note: input.note ?? null,
      operator: input.operator ?? null,
      operator_user_id: input.operatorUserId ?? null,
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

// D18/D19: a manual edit folds into the ACTIVE version's output (no new row).
// D22: it updates ONLY `output` — never `generated_output` — so the model's raw
// attempt stays frozen and the generated -> shipped diff survives the edit.
// Throws if the node has no active version (nothing to edit yet).
export async function updateActiveVersionOutput(
  nodeId: string,
  output: unknown,
): Promise<void> {
  const supabase = createServerSupabase();
  const { data: node, error: nodeErr } = await supabase
    .from("nodes")
    .select("active_version_id")
    .eq("id", nodeId)
    .maybeSingle();
  if (nodeErr) throw nodeErr;
  const activeId = (node as { active_version_id: string | null } | null)
    ?.active_version_id;
  if (!activeId) throw new Error("Node has no active version to update.");
  const { error } = await supabase
    .from("node_versions")
    .update({ output })
    .eq("id", activeId);
  if (error) throw error;
}

// D28: fold a selection into a SPECIFIC (non-active) version row's output. The compose
// row is never the node's active version, so updateActiveVersionOutput can't reach it.
// Updates ONLY `output` — `generated_output` stays frozen (D22), preserving the
// proposed-ideas -> shipped-description diff for the eval flywheel.
export async function updateVersionOutput(versionId: string, output: unknown): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("node_versions")
    .update({ output })
    .eq("id", versionId);
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

// Fetch a single version row by id — used by the image-edit route to resolve the base
// image (output) and carry forward its promptVersionId breadcrumb (spec §5).
export async function getVersionById(versionId: string): Promise<NodeVersionRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("node_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw error;
  return (data as NodeVersionRow | null) ?? null;
}
