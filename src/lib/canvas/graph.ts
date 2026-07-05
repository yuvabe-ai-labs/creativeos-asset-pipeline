import type { Edge } from "@xyflow/react";

// True when adding `source -> target` would close a cycle — i.e. `target` is
// already an ancestor of `source` (a path target -> … -> source exists). This is
// the only graph algorithm we need: the human triggers each node, so no
// topological sort (ADR D11). The existing graph is always acyclic, so we only
// check the one new edge against it.
export function wouldCreateCycle(edges: Edge[], source: string, target: string): boolean {
  if (source === target) return true;

  // adjacency: node -> its direct upstream parents
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    const arr = parents.get(e.target) ?? [];
    arr.push(e.source);
    parents.set(e.target, arr);
  }

  // walk upstream from `source`; reaching `target` means a cycle would form
  const stack: string[] = [source];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (cur === target) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const p of parents.get(cur) ?? []) stack.push(p);
  }
  return false;
}

/**
 * Walk edges upstream (BFS, bounded depth) from `nodeId` to the nearest node of `type`.
 * Generic over the node shape so both AppNode consumers and tests can call it.
 */
export function findAncestorOfType<T extends { id: string; type?: string }>(
  nodeId: string,
  nodes: T[],
  edges: Edge[],
  type: string,
  maxDepth = 4,
): T | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
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
        if (parent?.type === type) return parent;
        next.push(p);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return null;
}
