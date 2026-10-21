import type { Edge } from "@xyflow/react";

// D387 — collapsible shots. The only saved state is `data.collapsed` on a Shot node; which nodes
// hide is derived here from the graph on every render, so there is no membership list to keep in
// sync as nodes are added, rewired or deleted.
//
// A node's OWNERS are the Shots nearest upstream of it (shortest path; a tie gives several). An
// input File or Draw that no Shot reaches takes the owners of whatever it feeds. A node hides iff
// it has exactly one owner and that Shot is collapsed — so shared files and multi-shot nodes never
// hide.

/** The top handle a collapsed Shot shows for the lines rerouted into it. */
export const COLLAPSED_SHOT_HANDLE = "collapsed";

// Inputs a single shot can own outright (a reference image, a sketch).
const INPUT_TYPES = new Set(["file", "draw"]);

type GraphNode = { id: string; type?: string; data?: unknown };
type GraphEdge = { id: string; source: string; target: string };

export type CollapseModel = {
  shotIds: Set<string>;
  /** Non-shot node id → its owner shot ids, sorted. Absent = no owner (never hides). */
  owners: Map<string, string[]>;
};

export function isShotCollapsed(node: GraphNode): boolean {
  return node.type === "shot" && (node.data as { collapsed?: unknown } | undefined)?.collapsed === true;
}

export function collapsedShotIds(nodes: GraphNode[]): Set<string> {
  const ids = new Set<string>();
  for (const n of nodes) if (isShotCollapsed(n)) ids.add(n.id);
  return ids;
}

/** A duplicated Shot starts expanded: its copy has no pipeline of its own to hide. */
export function withoutCollapsed<T extends Record<string, unknown>>(data: T): T {
  if (!("collapsed" in data)) return data;
  const rest = { ...data };
  delete rest.collapsed;
  return rest;
}

export function buildCollapseModel(nodes: GraphNode[], edges: GraphEdge[]): CollapseModel {
  const typeById = new Map(nodes.map((n) => [n.id, n.type]));
  const shotIds = new Set(nodes.filter((n) => n.type === "shot").map((n) => n.id));
  const owners = new Map<string, string[]>();
  if (shotIds.size === 0) return { shotIds, owners };

  const children = new Map<string, string[]>();
  for (const e of edges) {
    if (!typeById.has(e.source) || !typeById.has(e.target)) continue;
    const list = children.get(e.source);
    if (list) list.push(e.target);
    else children.set(e.source, [e.target]);
  }

  // Multi-source BFS from every shot, one whole level at a time, so a node reached at the same
  // distance from two shots collects both before it propagates further. Never enters a shot.
  const ownerSets = new Map<string, Set<string>>();
  const dist = new Map<string, number>();
  let frontier = [...shotIds];
  for (const s of frontier) {
    ownerSets.set(s, new Set([s]));
    dist.set(s, 0);
  }
  for (let d = 1; frontier.length > 0; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      const from = ownerSets.get(id)!;
      for (const c of children.get(id) ?? []) {
        if (shotIds.has(c)) continue;
        const seen = dist.get(c);
        if (seen === undefined) {
          dist.set(c, d);
          ownerSets.set(c, new Set(from));
          next.push(c);
        } else if (seen === d) {
          for (const o of from) ownerSets.get(c)!.add(o);
        }
      }
    }
    frontier = next;
  }
  for (const [id, set] of ownerSets) if (!shotIds.has(id)) owners.set(id, [...set].sort());

  // Inputs no shot reaches: the union of what they feed, only if everything they feed is owned.
  for (const n of nodes) {
    if (!INPUT_TYPES.has(n.type ?? "") || owners.has(n.id)) continue;
    const targets = children.get(n.id) ?? [];
    if (targets.length === 0) continue;
    const union = new Set<string>();
    let allOwned = true;
    for (const t of targets) {
      const o = shotIds.has(t) ? [t] : owners.get(t);
      if (!o) {
        allOwned = false;
        break;
      }
      for (const s of o) union.add(s);
    }
    if (allOwned) owners.set(n.id, [...union].sort());
  }
  return { shotIds, owners };
}

export function hiddenNodeIds(model: CollapseModel, collapsed: Set<string>): Set<string> {
  const hidden = new Set<string>();
  if (collapsed.size === 0) return hidden;
  for (const [id, o] of model.owners) if (o.length === 1 && collapsed.has(o[0])) hidden.add(id);
  return hidden;
}

export function hiddenCountByShot(model: CollapseModel, hidden: Set<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of hidden) {
    const shot = model.owners.get(id)![0];
    counts.set(shot, (counts.get(shot) ?? 0) + 1);
  }
  return counts;
}

/** The node an endpoint is drawn at: itself, or the collapsed Shot hiding it. */
function visibleAt(model: CollapseModel, hidden: Set<string>, id: string): string {
  return hidden.has(id) ? model.owners.get(id)![0] : id;
}

/** The single shot a node belongs to (itself for a shot), or null when shared or unowned. */
function soleShot(model: CollapseModel, id: string): string | null {
  if (model.shotIds.has(id)) return id;
  const o = model.owners.get(id);
  return o?.length === 1 ? o[0] : null;
}

/**
 * The edges to draw: real edges between visible nodes untouched; edges touching a hidden node
 * redrawn to its collapsed Shot (display only — synthetic ids, not selectable or deletable, so they
 * can never produce a store change). A redrawn line inside one shot is dropped, several landing on
 * the same pair become one, and one that only repeats a real edge is dropped. A line between two
 * shots keeps a label naming the two original nodes.
 */
export function rerouteEdges<E extends Edge>(
  edges: E[],
  model: CollapseModel,
  hidden: Set<string>,
  labelFor: (nodeId: string) => string,
): E[] {
  if (hidden.size === 0) return edges;

  const kept: E[] = [];
  const realPairs = new Set<string>();
  const synthetic = new Map<string, { edge: E; members: string[]; labels: string[] }>();

  for (const e of edges) {
    if (!hidden.has(e.source) && !hidden.has(e.target)) {
      kept.push(e);
      realPairs.add(`${e.source}->${e.target}`);
      continue;
    }
    const source = visibleAt(model, hidden, e.source);
    const target = visibleAt(model, hidden, e.target);
    if (source === target) continue;

    const key = `${source}->${target}`;
    const from = soleShot(model, e.source);
    const to = soleShot(model, e.target);
    const label = from && to && from !== to ? `${labelFor(e.source)} → ${labelFor(e.target)}` : null;

    const existing = synthetic.get(key);
    if (existing) {
      existing.members.push(e.id);
      if (label && !existing.labels.includes(label)) existing.labels.push(label);
      continue;
    }
    synthetic.set(key, {
      edge: {
        ...e,
        id: `collapsed:${key}`,
        source,
        target,
        sourceHandle: source === e.source ? e.sourceHandle : null,
        targetHandle: target === e.target ? e.targetHandle : COLLAPSED_SHOT_HANDLE,
        selected: false,
        selectable: false,
        deletable: false,
        focusable: false,
      },
      members: [e.id],
      labels: label ? [label] : [],
    });
  }

  const rerouted: E[] = [];
  for (const [key, { edge, members, labels }] of synthetic) {
    if (realPairs.has(key)) continue;
    rerouted.push({
      ...edge,
      data: { memberIds: members },
      ...(labels.length > 0 && {
        label: labels.length === 1 ? labels[0] : `${labels[0]} +${labels.length - 1}`,
      }),
    });
  }
  return [...kept, ...rerouted];
}

/** The member edge ids a rerouted edge stands for (empty for a real edge). */
export function reroutedMembers(edge: { data?: unknown }): string[] {
  return (edge.data as { memberIds?: string[] } | undefined)?.memberIds ?? [];
}

/** A stable string for the collapsed set, so effects can tell when it changed. */
export function collapsedKey(collapsed: Set<string>): string {
  return [...collapsed].sort().join(",");
}

/**
 * Hiding only ever happens because someone collapsed a shot. Given the last and current render:
 * - the collapsed set changed → deselect hidden nodes, so Delete / ⌘D can't act on what's unseen;
 * - otherwise any node that newly hid (added or rewired under a collapsed shot), or a hidden node
 *   that something selected or opened, expands its shot.
 */
export function collapseGuardActions(
  model: CollapseModel,
  prev: { collapsedKey: string; hidden: Set<string> },
  next: { collapsedKey: string; hidden: Set<string>; selectedIds: string[]; focusedNodeId: string | null },
): { expand: string[]; deselect: string[] } {
  if (prev.collapsedKey !== next.collapsedKey) {
    return { expand: [], deselect: next.selectedIds.filter((id) => next.hidden.has(id)) };
  }
  const expand = new Set<string>();
  const reveal = (id: string) => {
    if (next.hidden.has(id)) expand.add(model.owners.get(id)![0]);
  };
  for (const id of next.hidden) if (!prev.hidden.has(id)) reveal(id);
  for (const id of next.selectedIds) reveal(id);
  if (next.focusedNodeId) reveal(next.focusedNodeId);
  return { expand: [...expand], deselect: [] };
}
