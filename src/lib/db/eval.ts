import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

// One reviewable eval trace = a Prompt node (one input/task, D4) + its active version's
// generated prompt and label. The "dataset" is a query across nodes (the 20-node model),
// here filtered to one eval canvas; production swaps the filter (client / edit-diff).
export type EvalTrace = {
  nodeId: string;
  versionId: string;
  evalKey: string;
  scriptNum: number;
  scriptTitle: string;
  reelType: string;
  shotIndex: number;
  shotText: string; // the source shot fed in (inputs_used.shotText)
  prompt: string; // the generated image prompt (generated_output)
  decision: "pass" | "fail" | null;
  note: string | null;
};

export async function listEvalTraces(canvasId: string): Promise<EvalTrace[]> {
  const supabase = createServerSupabase();

  const { data: nodes, error: nErr } = await supabase
    .from("nodes")
    .select("id, data, active_version_id")
    .eq("canvas_id", canvasId)
    .eq("type", "prompt");
  if (nErr) throw nErr;

  const activeIds = (nodes ?? [])
    .map((n) => (n as { active_version_id: string | null }).active_version_id)
    .filter((id): id is string => !!id);
  if (activeIds.length === 0) return [];

  const { data: versions, error: vErr } = await supabase
    .from("node_versions")
    .select("id, inputs_used, generated_output, output, decision, note")
    .in("id", activeIds);
  if (vErr) throw vErr;

  const vById = new Map(
    (versions ?? []).map((v) => [(v as { id: string }).id, v as Record<string, unknown>]),
  );

  const traces: EvalTrace[] = [];
  for (const n of nodes ?? []) {
    const node = n as { id: string; data: Record<string, unknown>; active_version_id: string | null };
    const v = node.active_version_id ? vById.get(node.active_version_id) : undefined;
    if (!v) continue;
    const inp = (v.inputs_used ?? {}) as Record<string, unknown>;
    const prompt =
      typeof v.generated_output === "string"
        ? v.generated_output
        : typeof v.output === "string"
          ? v.output
          : "";
    const decision = v.decision === "pass" || v.decision === "fail" ? v.decision : null;
    traces.push({
      nodeId: node.id,
      versionId: v.id as string,
      evalKey: String(node.data?.evalKey ?? ""),
      scriptNum: Number(inp.scriptNum ?? 0),
      scriptTitle: String(inp.scriptTitle ?? ""),
      reelType: String(inp.reelType ?? ""),
      shotIndex: Number(inp.shotIndex ?? 0),
      shotText: String(inp.shotText ?? ""),
      prompt,
      decision,
      note: typeof v.note === "string" ? v.note : null,
    });
  }

  traces.sort((a, b) => a.scriptNum - b.scriptNum || a.shotIndex - b.shotIndex);
  return traces;
}
