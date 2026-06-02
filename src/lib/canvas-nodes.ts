// Pure node types + mappers. Uses ONLY `import type` from React Flow, so this
// file is safe to import from Server Components (no React Flow runtime pulled in).
import type { Node } from "@xyflow/react";
import type { NodeRow } from "@/lib/db/types";

export type BriefNodeData = { title?: string };
export type AppNode = Node<BriefNodeData>;

// DB row → React Flow node (used on canvas load, server-side)
export function nodeRowToFlow(row: NodeRow): AppNode {
  return {
    id: row.id,
    type: row.type,
    position: row.position,
    data: (row.data ?? {}) as BriefNodeData,
  };
}

// React Flow node → the columns we persist (used on autosave, client-side)
export function flowToPersisted(n: AppNode) {
  return {
    id: n.id,
    type: n.type ?? "brief",
    position: n.position,
    data: n.data as Record<string, unknown>,
  };
}
