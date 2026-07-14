"use client";

import { useEffect, useRef } from "react";
import { flowToPersisted } from "@/lib/canvas-nodes";
import { saveCanvasAction } from "@/lib/actions/nodes";
import { useCanvasStoreApi } from "./canvas-store-provider";
import { runAutosaveFlush } from "./autosave-flush";
import { useRegisterAutosaveFlush } from "./autosave-flush-context";

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
  const registerFlush = useRegisterAutosaveFlush();

  useEffect(() => {
    // Imperative flush: cancel pending debounce and persist current state immediately.
    async function flush() {
      if (!canEditRef.current) return;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      const s = storeApi.getState();
      await runAutosaveFlush({
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
      });
      if (canEditRef.current) {
        storeApi.getState().clearRemoved(s.removedNodeIds, s.removedEdgeIds);
      }
    }
    registerFlush(flush);

    const unsub = storeApi.subscribe((state, prev) => {
      if (state.nodes === prev.nodes && state.edges === prev.edges) return;
      if (!canEditRef.current) return; // read-only: never persist
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, 600);
    });
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [storeApi, canvasId, sessionId, onLockLost, registerFlush]);

  return null;
}
