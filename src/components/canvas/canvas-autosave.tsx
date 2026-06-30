"use client";

import { useEffect, useRef } from "react";
import { flowToPersisted } from "@/lib/canvas-nodes";
import { saveCanvasAction } from "@/lib/actions/nodes";
import { useCanvasStoreApi } from "./canvas-store-provider";
import { runAutosaveFlush } from "./autosave-flush";

// Subscribes to the store; 600ms after the last node/edge change it flushes a
// conflict-aware save. The concurrency token (canvases.updated_at) lives in a ref,
// seeded from the value loaded with the page and refreshed after every save.
export function CanvasAutosave({
  canvasId,
  initialUpdatedAt,
}: {
  canvasId: string;
  initialUpdatedAt: string;
}) {
  const storeApi = useCanvasStoreApi();
  const tokenRef = useRef(initialUpdatedAt);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = storeApi.subscribe((state, prev) => {
      // Only react to graph edits — ignore tombstone-only / videoGenStatus updates.
      if (state.nodes === prev.nodes && state.edges === prev.edges) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const s = storeApi.getState();
        void runAutosaveFlush({
          canvasId,
          snapshot: {
            nodes: s.nodes.map(flowToPersisted),
            edges: s.edges,
            removedNodeIds: s.removedNodeIds,
            removedEdgeIds: s.removedEdgeIds,
          },
          expectedUpdatedAt: tokenRef.current,
          save: saveCanvasAction,
          onSaved: (updatedAt, flushedNodeIds, flushedEdgeIds) => {
            tokenRef.current = updatedAt;
            storeApi.getState().clearRemoved(flushedNodeIds, flushedEdgeIds);
          },
          onMerge: (fresh) => {
            storeApi.getState().replaceCanvas(fresh.nodes, fresh.edges);
          },
        });
      }, 600);
    });
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [storeApi, canvasId]);

  return null;
}
