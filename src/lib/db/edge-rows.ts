import type { Edge } from "@xyflow/react";

/**
 * An `edges` row. Note the column names: `source_node_id` / `target_node_id`, NOT React
 * Flow's `source` / `target`. Both are NOT NULL, so writing the wrong names does not
 * silently drop a field — the insert fails.
 */
export type EdgeRow = {
  id: string;
  canvas_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string | null;
  target_handle: string | null;
};

/**
 * THE conversion between an `edges` row and a React Flow edge, in both directions.
 *
 * Kept in one pure module because hand-mapping it a third time is what broke batch
 * duplicate: `/api/nodes/duplicate-batch` built its rows with `source` / `target`, so every
 * duplicate of a selection containing an edge failed at the insert and returned a 500. The
 * names differ by exactly enough to look right while being wrong.
 */
export function edgeRowToFlow(row: EdgeRow): Edge {
  return {
    id: row.id,
    source: row.source_node_id,
    target: row.target_node_id,
    // undefined, not null: React Flow treats a null handle id as a real handle and fails to
    // match it against a node's actual handles.
    sourceHandle: row.source_handle ?? undefined,
    targetHandle: row.target_handle ?? undefined,
  };
}

export function flowEdgeToRow(canvasId: string, edge: Edge): EdgeRow {
  return {
    id: edge.id,
    canvas_id: canvasId,
    source_node_id: edge.source,
    target_node_id: edge.target,
    source_handle: edge.sourceHandle ?? null,
    target_handle: edge.targetHandle ?? null,
  };
}
