"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import { nodeHandle } from "@/lib/nodes/describe-node";
import {
  buildCollapseModel,
  collapseGuardActions,
  collapsedKey,
  collapsedShotIds,
  hiddenCountByShot,
  hiddenNodeIds,
  rerouteEdges,
} from "@/lib/canvas/shot-collapse";
import { useCanvasStore, useCanvasStoreApi } from "./canvas-store-provider";

// D387 — what the canvas draws once collapsed shots are applied: nodes they hide marked
// `hidden`, edges touching those nodes redrawn to their Shot, and each Shot's hidden count.
// Nothing here is written to the store's nodes or edges except through the guards below.
//
// The canvas re-renders on every drag frame, so the graph walk is keyed on the graph's SHAPE
// (ids, types, edges), not on the nodes array: moving a node does not recompute ownership.
export function useShotCollapse(nodes: AppNode[], edges: Edge[]) {
  const storeApi = useCanvasStoreApi();
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);

  const shapeKey = useMemo(() => nodes.map((n) => `${n.id}:${n.type ?? ""}`).join("|"), [nodes]);
  const shape = useMemo(
    () =>
      shapeKey
        ? shapeKey.split("|").map((entry) => {
            const [id, type] = entry.split(":");
            return { id, type };
          })
        : [],
    [shapeKey],
  );
  const model = useMemo(() => buildCollapseModel(shape, edges), [shape, edges]);

  const collapsedIdsKey = useMemo(() => collapsedKey(collapsedShotIds(nodes)), [nodes]);
  const hidden = useMemo(
    () => hiddenNodeIds(model, new Set(collapsedIdsKey ? collapsedIdsKey.split(",") : [])),
    [model, collapsedIdsKey],
  );
  const hiddenCounts = useMemo(() => hiddenCountByShot(model, hidden), [model, hidden]);

  const displayNodes = useMemo(
    () => (hidden.size === 0 ? nodes : nodes.map((n) => (hidden.has(n.id) ? { ...n, hidden: true } : n))),
    [nodes, hidden],
  );
  const displayEdges = useMemo(() => {
    const typeById = new Map(shape.map((n) => [n.id, n.type]));
    return rerouteEdges(edges, model, hidden, (id) => nodeHandle({ id, type: typeById.get(id) }));
  }, [edges, model, hidden, shape]);

  // Guards: hiding only ever happens because someone collapsed a shot (see collapseGuardActions).
  const selectedHiddenKey = useMemo(
    () =>
      hidden.size === 0
        ? ""
        : nodes
            .filter((n) => n.selected && hidden.has(n.id))
            .map((n) => n.id)
            .join(","),
    [nodes, hidden],
  );
  const prevRef = useRef<{ collapsedKey: string; hidden: Set<string> } | null>(null);
  useEffect(() => {
    // The first render counts as a collapse change: a canvas opening with collapsed shots expands nothing.
    const prev = prevRef.current ?? { collapsedKey: "\u0000initial", hidden: new Set<string>() };
    prevRef.current = { collapsedKey: collapsedIdsKey, hidden };
    const { expand, deselect } = collapseGuardActions(model, prev, {
      collapsedKey: collapsedIdsKey,
      hidden,
      selectedIds: selectedHiddenKey ? selectedHiddenKey.split(",") : [],
      focusedNodeId,
    });
    const state = storeApi.getState();
    if (deselect.length > 0) {
      state.onNodesChange(deselect.map((id) => ({ type: "select", id, selected: false })));
    }
    if (expand.length > 0) state.setShotsCollapsed(expand, false);
  }, [model, hidden, collapsedIdsKey, selectedHiddenKey, focusedNodeId, storeApi]);

  return {
    nodes: displayNodes,
    edges: displayEdges,
    hiddenCounts,
    shotIds: model.shotIds,
    collapsedCount: collapsedIdsKey ? collapsedIdsKey.split(",").length : 0,
  };
}
