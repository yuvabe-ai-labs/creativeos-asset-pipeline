// Pure node types + mappers. Uses ONLY `import type` from React Flow, so this
// file is safe to import from Server Components (no React Flow runtime pulled in).
import type { Node } from "@xyflow/react";
import type { NodeRow } from "@/lib/db/types";
import type { KBSliceKey } from "@/lib/kb/parse-context";
import type { ReelScript } from "@/lib/nodes/reel-script";

export type ScriptNodeData = {
  title?: string;
  source?: string; // raw script text (pasted or uploaded .md/.txt)
  parsed?: unknown; // active parsed output — DISPLAY ONLY, hydrated from the active version (D19); never persisted
  kbSlices?: KBSliceKey[]; // KB slices injected into parse context; undefined = DEFAULT_PARSE_SLICES
};

export type KBNodeData = {
  clientId: string;
  clientSlug: string;
  kbVersionId: string | null;
  brandName: string | null;
  fillRate: number | null;
  extractedAt: string | null;
};

export type TextNodeData = {
  text?: string; // free-text context; this node's "output" (no version log, D19)
};

export type PromptNodeData = {
  title?: string;
  instruction?: string; // operator instruction
  parsed?: unknown; // active output (generated prompt text) — DISPLAY ONLY, hydrated from the active version (D19)
  kbSlices?: KBSliceKey[]; // ambient KB slices injected into the compiled prompt
};

export type ShotNodeData = {
  // The parent reel script narrowed to a SINGLE shot — "a Script node with one shot"
  // (D21). Carries the full metadata (objective, on-screen text, voiceover, caption…)
  // so downstream prompts keep the whole creative context, not just the shot line.
  // Editable; this node's output (D19/D20) — rendered via renderScriptAsText.
  script?: ReelScript;
  order?: number; // 1-based position in the script (display + Stage 5 assembly)
  seededFrom?: {
    scriptNodeId: string;
    shotIndex: number; // 0-based index in visual_script.shots at fork time
    scriptTitle?: string; // for the provenance label without a lookup
  };
};

export type AppNode =
  | Node<ScriptNodeData, "script">
  | Node<KBNodeData, "kb">
  | Node<TextNodeData, "text">
  | Node<PromptNodeData, "prompt">
  | Node<ShotNodeData, "shot">;

// A node row joined with its active version's output (canvas-load shape).
// `active` is the to-one embed of node_versions via nodes.active_version_id.
export type NodeWithActive = NodeRow & {
  active: { output: unknown } | null;
};

// DB row → React Flow node (used on canvas load, server-side).
// `data.parsed` is DERIVED from the active version's output (D19): it is hydrated
// here for display only and is never read from / written to the persisted row.
export function nodeRowToFlow(row: NodeWithActive): AppNode {
  // "brief" was renamed to "script" — migrate old rows on read so they render correctly.
  const type = row.type === "brief" ? "script" : row.type;
  // Strip any stale persisted `parsed`; output is the single source of truth now.
  const own = { ...((row.data ?? {}) as Record<string, unknown>) };
  delete own.parsed;
  const output = row.active?.output;
  const data = output != null ? { ...own, parsed: output } : own;
  return {
    id: row.id,
    type: type as AppNode["type"],
    position: row.position,
    data: data as AppNode["data"],
  } as AppNode;
}

// React Flow node → the columns we persist (used on autosave, client-side).
// `parsed` is intentionally omitted — it is derived from the active version (D19).
export function flowToPersisted(n: AppNode) {
  const data = { ...(n.data as Record<string, unknown>) };
  delete data.parsed;
  return {
    id: n.id,
    type: n.type as string,
    position: n.position,
    data,
  };
}
