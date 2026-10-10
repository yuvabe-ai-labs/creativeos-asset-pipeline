"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { flowToPersisted } from "@/lib/canvas-nodes";
import { saveCanvasAction } from "@/lib/actions/nodes";
import { useCanvasStoreApi } from "./canvas-store-provider";
import {
  runAutosaveFlush,
  hasUnsavedChanges,
  savedBaseline,
  type SavedBaseline,
} from "./autosave-flush";
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
  // What the server last confirmed, so a flush with nothing new is a no-op (see
  // hasUnsavedChanges). Null until the effect below seeds it.
  const savedRef = useRef<SavedBaseline | null>(null);
  // The save currently running. Saves are serialised: a second flush waits for this one,
  // then persists only what it missed, instead of racing it with a duplicate request.
  const inFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    // The store is built from the server's rows, so its state when autosave first mounts
    // IS the saved state. Seeded once only: this effect re-runs when its deps change, and
    // re-seeding then would mark unsaved edits as saved.
    if (!savedRef.current) {
      const initial = storeApi.getState();
      savedRef.current = savedBaseline(initial.nodes, initial.edges);
    }

    // Imperative flush: cancel pending debounce and persist current state immediately.
    async function flush() {
      if (!canEditRef.current) return;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      while (inFlightRef.current) await inFlightRef.current;
      const s = storeApi.getState();
      if (!hasUnsavedChanges(s, savedRef.current)) {
        // Same content in new arrays (a selection, a measured size): adopt them, so the next
        // check short-circuits on reference equality instead of re-fingerprinting.
        if (savedRef.current) savedRef.current = { ...savedRef.current, nodes: s.nodes, edges: s.edges };
        return;
      }
      const run = persist(s);
      inFlightRef.current = run;
      try {
        await run;
      } finally {
        inFlightRef.current = null;
      }
    }

    async function persist(s: ReturnType<typeof storeApi.getState>) {
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
        // The arrays as they were SENT, not as they are now: an edit made while this save
        // was in flight is a new array, so it still reads as unsaved.
        savedRef.current = savedBaseline(s.nodes, s.edges);
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
