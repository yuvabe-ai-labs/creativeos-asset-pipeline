// Pure node types + mappers. Uses ONLY `import type` from React Flow, so this
// file is safe to import from Server Components (no React Flow runtime pulled in).
import type { Node } from "@xyflow/react";
import type { NodeRow } from "@/lib/db/types";

export type BriefNodeData = {
  title?: string;
  source?: string; // raw brief text (pasted or uploaded .md/.txt)
  parsed?: unknown; // active parsed output (display cache; full log in node_versions)
};

export type KBNodeData = {
  clientId: string;
  kbVersionId: string | null;
  brandName: string | null;
  fillRate: number | null;
  extractedAt: string | null;
};

export type AppNode =
  | Node<BriefNodeData, "brief">
  | Node<KBNodeData, "kb">;

// DB row → React Flow node (used on canvas load, server-side)
// The type cast is intentional: row.type is the DB string which we trust to be
// a valid node type; TypeScript can't narrow a runtime string to a literal union.
export function nodeRowToFlow(row: NodeRow): AppNode {
  return {
    id: row.id,
    type: row.type as AppNode["type"],
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
