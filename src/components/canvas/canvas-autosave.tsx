"use client";

import { useEffect, useRef } from "react";
import { flowToPersisted } from "@/lib/canvas-nodes";
import { saveCanvasAction } from "@/lib/actions/nodes";
import { useCanvasStoreApi } from "./canvas-store-provider";
import { runAutosaveFlush } from "./autosave-flush";

// Debounced, server-enforced autosave. Only runs while this session holds the lock
// (canEdit). A rejected save (lock lost) calls onLockLost so the UI flips to read-only.
export function CanvasAutosave({
  canvasId,
  sessionId,
  canEdit,
  onLockLost,
}: {
  canvasId: string;
  sessionId: string;
  canEdit: boolean;
  onLockLost: () => void;
}) {
  const storeApi = useCanvasStoreApi();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;

  useEffect(() => {
    const unsub = storeApi.subscribe((state, prev) => {
      if (state.nodes === prev.nodes && state.edges === prev.edges) return;
      if (!canEditRef.current) return; // read-only: never persist
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
          sessionId,
          save: saveCanvasAction,
          onLockLost,
        }).then(() => {
          if (canEditRef.current) {
            storeApi.getState().clearRemoved(s.removedNodeIds, s.removedEdgeIds);
          }
        });
      }, 600);
    });
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [storeApi, canvasId, sessionId, onLockLost]);

  return null;
}
