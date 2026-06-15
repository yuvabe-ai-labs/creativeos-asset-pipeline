// Pure mapping: raw (node, version) rows → reviewable EvalTrace[]. Kept free of
// `server-only` / supabase so it is unit-testable; src/lib/db/eval.ts does the queries
// and calls this. (A node = one input/task, D4; we read each node's ACTIVE version.)

export type EvalTrace = {
  nodeId: string;
  versionId: string;
  evalKey: string;
  scriptNum: number;
  scriptTitle: string;
  reelType: string;
  shotIndex: number;
  shotText: string; // the source shot fed in (inputs_used.shotText)
  prompt: string; // the generated image prompt (generated_output, falling back to output)
  decision: "pass" | "fail" | null;
  note: string | null;
};

export type EvalNodeRow = {
  id: string;
  data: Record<string, unknown> | null;
  active_version_id: string | null;
};

export type EvalVersionRow = {
  id: string;
  inputs_used: Record<string, unknown> | null;
  generated_output: unknown;
  output: unknown;
  decision: unknown;
  note: unknown;
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function mapEvalTraces(
  nodes: EvalNodeRow[],
  versions: EvalVersionRow[],
): EvalTrace[] {
  const vById = new Map(versions.map((v) => [v.id, v]));

  const traces: EvalTrace[] = [];
  for (const node of nodes) {
    const v = node.active_version_id ? vById.get(node.active_version_id) : undefined;
    if (!v) continue; // a node with no active version (or a missing row) isn't reviewable

    const inp = v.inputs_used ?? {};
    const prompt =
      typeof v.generated_output === "string"
        ? v.generated_output
        : typeof v.output === "string"
          ? v.output
          : "";
    const decision = v.decision === "pass" || v.decision === "fail" ? v.decision : null;

    traces.push({
      nodeId: node.id,
      versionId: v.id,
      evalKey: asString(node.data?.evalKey),
      scriptNum: asNumber(inp.scriptNum),
      scriptTitle: asString(inp.scriptTitle),
      reelType: asString(inp.reelType),
      shotIndex: asNumber(inp.shotIndex),
      shotText: asString(inp.shotText),
      prompt,
      decision,
      note: typeof v.note === "string" ? v.note : null,
    });
  }

  traces.sort((a, b) => a.scriptNum - b.scriptNum || a.shotIndex - b.shotIndex);
  return traces;
}
