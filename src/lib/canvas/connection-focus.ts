// The connections to highlight when the operator selects nodes or a connection:
// - every selected connection;
// - for a selected node, its whole upstream chain (parents, grandparents, … all the way up),
//   so a Video Gen shows everything that feeds it, plus its own outgoing connections.

type FocusNode = { id: string; selected?: boolean };
type FocusEdge = { id: string; source: string; target: string; selected?: boolean };

export function highlightedEdgeIds(nodes: FocusNode[], edges: FocusEdge[]): Set<string> {
  const ids = new Set<string>();
  for (const e of edges) if (e.selected) ids.add(e.id);

  const selected = nodes.filter((n) => n.selected).map((n) => n.id);
  if (selected.length === 0) return ids;

  const selectedSet = new Set(selected);
  const incoming = new Map<string, FocusEdge[]>();
  for (const e of edges) {
    const list = incoming.get(e.target);
    if (list) list.push(e);
    else incoming.set(e.target, [e]);
    if (selectedSet.has(e.source)) ids.add(e.id); // its own outgoing connections
  }

  // Walk upstream. `visited` guards against cycles.
  const visited = new Set<string>(selected);
  const queue = [...selected];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const e of incoming.get(id) ?? []) {
      ids.add(e.id);
      if (!visited.has(e.source)) {
        visited.add(e.source);
        queue.push(e.source);
      }
    }
  }
  return ids;
}
