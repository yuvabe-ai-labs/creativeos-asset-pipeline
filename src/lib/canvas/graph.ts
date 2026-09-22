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

export type ConnectionPath =
  | { kind: "direct" }
  /** `viaId` is the node the input reaches `target` through — the one directly wired into it. */
  | { kind: "via"; viaId: string }
  | { kind: "none" };

/**
 * How `source` reaches `target`: by its own edge, through another node, or not at all.
 *
 * A focus view's "Connected" rail lists inputs gathered by a multi-level walk (a Video Gen shows
 * the images wired into its prompt node), so its ✕ cannot assume an edge exists to remove. Direct
 * wins when both hold; otherwise the node named is the one adjacent to `target`, since that is
 * where the operator would go to unwire it.
 */
export function connectionPath(edges: Edge[], source: string, target: string): ConnectionPath {
  if (edges.some((e) => e.source === source && e.target === target)) return { kind: "direct" };

  // Walk upstream from `target`, remembering which of its direct parents each node was reached
  // through; the first time we meet `source`, that parent is the answer.
  const parentsOf = (id: string) => edges.filter((e) => e.target === id).map((e) => e.source);
  const reachedVia = new Map<string, string>();
  const queue: string[] = [];
  for (const p of parentsOf(target)) {
    reachedVia.set(p, p);
    queue.push(p);
  }
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    const via = reachedVia.get(cur) as string;
    for (const p of parentsOf(cur)) {
      if (p === source) return { kind: "via", viaId: via };
      if (reachedVia.has(p)) continue;
      reachedVia.set(p, via);
      queue.push(p);
    }
  }
  return { kind: "none" };
}

/**
 * Walk edges downstream (BFS, bounded depth) from `nodeId`, collecting every node of `type`.
 * Mirror of findAncestorOfType, following source -> target instead of target -> source.
 */
export function findDescendantsOfType<T extends { id: string; type?: string }>(
  nodeId: string,
  nodes: T[],
  edges: Edge[],
  type: string,
  maxDepth = 4,
): T[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenOf = (id: string) => edges.filter((edge) => edge.source === id).map((edge) => edge.target);
  const seen = new Set<string>([nodeId]);
  const found: T[] = [];
  let frontier = [nodeId];
  for (let depth = 0; depth < maxDepth; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const c of childrenOf(id)) {
        if (seen.has(c)) continue;
        seen.add(c);
        const child = byId.get(c);
        if (child?.type === type) found.push(child);
        next.push(c);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return found;
}
