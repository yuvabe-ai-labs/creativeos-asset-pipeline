// Pure node types + mappers. Uses ONLY `import type` from React Flow, so this
// file is safe to import from Server Components (no React Flow runtime pulled in).
import type { Node } from "@xyflow/react";
import type { NodeRow } from "@/lib/db/types";
import type { KBSliceKey } from "@/lib/kb/parse-context";

export type ScriptNodeData = {
  title?: string;
  source?: string; // raw script text (pasted or uploaded .md/.txt)
  parsed?: unknown; // active parsed output (display cache; full log in node_versions)
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

export type AppNode =
  | Node<ScriptNodeData, "script">
  | Node<KBNodeData, "kb">;

// DB row → React Flow node (used on canvas load, server-side)
// The type cast is intentional: row.type is the DB string which we trust to be
// a valid node type; TypeScript can't narrow a runtime string to a literal union.
export function nodeRowToFlow(row: NodeRow): AppNode {
  // "brief" was renamed to "script" — migrate old rows on read so they render correctly.
  // The autosave will persist the corrected type back to the DB on next save.
  const type = row.type === "brief" ? "script" : row.type;
  return {
    id: row.id,
    type: type as AppNode["type"],
    position: row.position,
    data: (row.data ?? {}) as AppNode["data"],
  } as AppNode;
}

// React Flow node → the columns we persist (used on autosave, client-side)
export function flowToPersisted(n: AppNode) {
  return {
    id: n.id,
    type: n.type as string,
    position: n.position,
    data: n.data as Record<string, unknown>,
  };
}
