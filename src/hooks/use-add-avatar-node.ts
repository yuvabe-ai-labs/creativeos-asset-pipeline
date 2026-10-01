"use client";

import { useCallback } from "react";
import type { XYPosition } from "@xyflow/react";
import { useCanvasStore, useCanvasStoreApi } from "@/components/canvas/canvas-store-provider";
import { presenterAvatarId } from "@/lib/avatars/canvas";

/** How far left of its script a presenter is placed: a Script card's width plus a gap. */
const PRESENTER_OFFSET_X = 240;

// D298 — the one way an Avatar node is added: from the gallery's tile, a drop on the canvas, or a
// drop on a Script. With `presenterOf`, it is placed beside that script and connected to it; the
// store replaces any presenter the script had, and announces it once. Connecting the avatar the
// script already has is a no-op rather than a second copy of the same node.
export function useAddAvatarNode() {
  const addNode = useCanvasStore((s) => s.addNode);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const connectNodes = useCanvasStore((s) => s.connectNodes);
  const storeApi = useCanvasStoreApi();

  return useCallback(
    (avatarId: string, opts: { position: XYPosition; presenterOf?: string }) => {
      const { nodes, edges } = storeApi.getState();
      let position = opts.position;
      if (opts.presenterOf) {
        if (presenterAvatarId(opts.presenterOf, nodes, edges) === avatarId) return;
        const script = nodes.find((n) => n.id === opts.presenterOf);
        if (script) position = { x: script.position.x - PRESENTER_OFFSET_X, y: script.position.y };
      }
      const nodeId = crypto.randomUUID();
      addNode("avatar", position, nodeId);
      updateNodeData(nodeId, { avatarId });
      if (opts.presenterOf) connectNodes(nodeId, opts.presenterOf);
    },
    [addNode, updateNodeData, connectNodes, storeApi],
  );
}
