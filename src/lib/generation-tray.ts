// Pure Generation Tray logic. Uses ONLY `import type`, so it is safe to import
// anywhere (no React Flow / Supabase runtime pulled in). Everything the tray shows
// is derived on read (D9) from the node graph + the `generations` job rows.
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";

/** Walk edges upstream (BFS, bounded depth) from `nodeId` to the nearest `shot` node. */
export function findShotAncestor(
  nodeId: string,
  nodes: AppNode[],
  edges: Edge[],
  maxDepth = 4,
): AppNode | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parentsOf = (id: string) => edges.filter((e) => e.target === id).map((e) => e.source);
  const seen = new Set<string>([nodeId]);
  let frontier = [nodeId];
  for (let depth = 0; depth < maxDepth; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const p of parentsOf(id)) {
        if (seen.has(p)) continue;
        seen.add(p);
        const parent = byId.get(p);
        if (parent?.type === "shot") return parent;
        next.push(p);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return null;
}

/** Human label for a generation node: "Shot N" from its shot ancestor, else the node's title. */
export function resolveShotLabel(nodeId: string, nodes: AppNode[], edges: Edge[]): string {
  const shot = findShotAncestor(nodeId, nodes, edges);
  if (shot) {
    const order = (shot.data as { order?: number }).order;
    return typeof order === "number" ? `Shot ${order}` : "Shot";
  }
  const self = nodes.find((n) => n.id === nodeId);
  const title = (self?.data as { title?: string } | undefined)?.title?.trim();
  return title ? title : "Untitled";
}
