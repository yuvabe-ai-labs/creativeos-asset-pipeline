"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
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
  // One toast per failure streak — autosave retries every debounce tick, and a
  // toast per retry would spam. Reset on the next successful save.
  const saveFailedRef = useRef(false);

  useEffect(() => {
    // Imperative flush: cancel pending debounce and persist current state immediately.
    async function flush() {
      if (!canEditRef.current) return;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      const s = storeApi.getState();
      const outcome = await runAutosaveFlush({
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
      if (outcome === "saved") {
        if (saveFailedRef.current) {
          saveFailedRef.current = false;
          toast.success("Canvas saved.");
        }
        // Clear deletion intent ONLY after the server confirmed the save — clearing
        // on failure permanently loses the delete (it would never be retried) while
        // the rows survive in the DB and resurrect on reload.
        if (canEditRef.current) {
          storeApi.getState().clearRemoved(s.removedNodeIds, s.removedEdgeIds);
        }
      } else if (outcome === "error") {
        if (!saveFailedRef.current) {
          saveFailedRef.current = true;
          toast.error(
            "Couldn't save the canvas — recent changes (including deletes) aren't persisted yet. Retrying automatically.",
          );
        }
        // Retry even if the user goes idle — otherwise an unsaved delete would sit
        // in memory until the next canvas change (or be lost on tab close).
        if (!timer.current) {
          timer.current = setTimeout(() => {
            timer.current = null;
            void flush();
          }, 5000);
        }
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
