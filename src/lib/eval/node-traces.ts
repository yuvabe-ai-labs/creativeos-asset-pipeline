import type { ModelRequestRecord } from "@/lib/nodes/model-request";

export type NodeAction = "prompt" | "image-gen" | "video-prompt" | "video-gen" | "script";
export type Modality = "text" | "image" | "video" | "structured";

export const GENERATED_TYPES: NodeAction[] = ["prompt", "image-gen", "video-prompt", "video-gen", "script"];

// Which modality a node type's OUTPUT is.
const OUTPUT_KIND: Record<NodeAction, Modality> = {
  prompt: "text", "video-prompt": "text", script: "structured",
  "image-gen": "image", "video-gen": "video",
};

export type TraceVersion = {
  versionId: string;
  createdAt: string;
  input: { text?: string; images?: string[] };
  output: { kind: Modality; text?: string; urls?: string[] };
  request: ModelRequestRecord | null;
  instruction?: string;
  controls?: Record<string, unknown> | null;
  kbSlices?: string[];
  upstream?: { nodeId: string; versionId: string }[];
  promptVersion?: string;
  decision: "pass" | "fail" | null;
  note: string | null;
};

export type NodeTrace = {
  nodeId: string;
  action: NodeAction;
  title: string;
  activeVersionId: string | null;
  versions: TraceVersion[]; // newest → oldest
};

// A node's live upstream input, resolved server-side (capture-independent) so panel
// A works for EVERY node type and version — used as the fallback when a version has
// no frozen shotText/request. Keyed by nodeId in `mapNodeTraces`.
export type ResolvedUpstream = { text: string; images: string[] };

export type TraceNodeRow = {
  id: string;
  type: string;
  data: Record<string, unknown> | null;
  active_version_id: string | null;
};
export type TraceVersionRow = {
  id: string;
  node_id: string;
  created_at: string;
  inputs_used: Record<string, unknown> | null;
  params_used: Record<string, unknown> | null;
  generated_output: unknown;
  output: unknown;
  decision: unknown;
  note: unknown;
};

function str(v: unknown): string | undefined { return typeof v === "string" ? v : undefined; }
function strArr(v: unknown): string[] { return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; }

// The faithful, frozen input for panel A. Eval-canvas traces store `shotText`;
// production traces don't, so fall back to the non-boilerplate blocks of the
// captured compiled request (the shot/upstream the model actually received).
const INPUT_BOILERPLATE = /^(Brand context:|Shot controls|Instruction:)/;
function deriveInputText(inp: Record<string, unknown>, request: ModelRequestRecord | null): string | undefined {
  const shot = str(inp.shotText);
  if (shot) return shot;
  const compiled = request?.compiledUser;
  if (typeof compiled !== "string") return undefined;
  const blocks = compiled
    .split("\n\n")
    .map((b) => b.trim())
    .filter((b) => b.length > 0 && !INPUT_BOILERPLATE.test(b));
  const text = blocks.join("\n\n").replace(/^Creating an image prompt for this specific shot:\s*/i, "");
  return text || undefined;
}

function toVersion(action: NodeAction, row: TraceVersionRow, up?: ResolvedUpstream): TraceVersion {
  const inp = (row.inputs_used ?? {}) as Record<string, unknown>;
  const params = (row.params_used ?? {}) as Record<string, unknown>;
  const request = (inp.request ?? null) as ModelRequestRecord | null;
  const kind = OUTPUT_KIND[action];

  const text = str(row.generated_output) ?? str(row.output) ?? "";
  const output =
    kind === "text" || kind === "structured"
      ? { kind, text }
      : { kind, urls: str(row.output) ? [str(row.output)!] : [] };

  const attachments = request?.attachments ?? [];
  return {
    versionId: row.id,
    createdAt: row.created_at,
    input: {
      // Prefer frozen at-generation input; fall back to the resolved live upstream
      // so old / media nodes (no captured request) aren't blank.
      text: deriveInputText(inp, request) ?? (up?.text || undefined),
      images: attachments.length ? attachments : (up?.images ?? []),
    },
    output,
    request,
    instruction: str(params.instruction),
    controls: (params.controls ?? null) as Record<string, unknown> | null,
    kbSlices: strArr(inp.kbSlices),
    upstream: Array.isArray(inp.upstream) ? (inp.upstream as { nodeId: string; versionId: string }[]) : [],
    promptVersion: str(params.promptVersion),
    decision: row.decision === "pass" || row.decision === "fail" ? row.decision : null,
    note: str(row.note) ?? null,
  };
}

export function mapNodeTraces(
  nodes: TraceNodeRow[],
  versions: TraceVersionRow[],
  upstreamByNode?: Map<string, ResolvedUpstream>,
): NodeTrace[] {
  const generated = nodes.filter((n) => (GENERATED_TYPES as string[]).includes(n.type));
  const byNode = new Map<string, TraceVersionRow[]>();
  for (const v of versions) {
    const list = byNode.get(v.node_id) ?? [];
    list.push(v);
    byNode.set(v.node_id, list);
  }

  const traces: NodeTrace[] = [];
  for (const n of generated) {
    const action = n.type as NodeAction;
    const rows = (byNode.get(n.id) ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (rows.length === 0) continue;
    const up = upstreamByNode?.get(n.id);
    traces.push({
      nodeId: n.id,
      action,
      title: str(n.data?.evalKey) ?? str(n.data?.title) ?? n.id,
      activeVersionId: n.active_version_id,
      versions: rows.map((r) => toVersion(action, r, up)),
    });
  }
  return traces;
}
