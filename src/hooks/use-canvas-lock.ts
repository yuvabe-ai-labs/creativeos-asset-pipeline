"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { useIdentity } from "./use-identity";
import {
  lockReducer,
  INITIAL_LOCK_STATE,
  isLockStale,
  canEdit as isEditorState,
  HEARTBEAT_MS,
} from "@/lib/canvas/lock-state";
import {
  acquireCanvasLockAction,
  heartbeatCanvasLockAction,
  getCanvasLockAction,
} from "@/lib/actions/canvas-lock";

const POLL_MS = 10_000;

// D33: acquires a per-tab lock on the canvas, heartbeats while editing, releases on
// unload, and polls for take-over while read-only.
export function useCanvasLock(canvasId: string) {
  const { identity } = useIdentity();
  const [state, dispatch] = useReducer(lockReducer, INITIAL_LOCK_STATE);

  const sessionIdRef = useRef<string | null>(null);
  if (sessionIdRef.current === null) sessionIdRef.current = crypto.randomUUID();
  const sessionId = sessionIdRef.current;

  const nameRef = useRef<string | null>(identity?.name ?? null);
  nameRef.current = identity?.name ?? null;

  // Acquire on mount.
  useEffect(() => {
    let cancelled = false;
    void acquireCanvasLockAction(canvasId, sessionId, nameRef.current).then((r) => {
      if (cancelled) return;
      dispatch(r.ok ? { type: "acquired" } : { type: "denied", heldByName: r.heldBy.name });
    });
    return () => {
      cancelled = true;
    };
  }, [canvasId, sessionId]);

  const isEditor = isEditorState(state);

  // Heartbeat + release while editing.
  useEffect(() => {
    if (!isEditor) return;
    const id = setInterval(() => {
      void heartbeatCanvasLockAction(canvasId, sessionId).then((r) => {
        if (!r.ok) dispatch({ type: "heartbeatLost" });
      });
    }, HEARTBEAT_MS);

    const release = () => {
      navigator.sendBeacon?.(
        `/api/canvases/${canvasId}/lock/release`,
        new Blob([JSON.stringify({ sessionId })], { type: "application/json" }),
      );
    };
    window.addEventListener("beforeunload", release);
    return () => {
      clearInterval(id);
      window.removeEventListener("beforeunload", release);
      release(); // also release on unmount (navigating away in-app)
    };
  }, [isEditor, canvasId, sessionId]);

  // Poll while viewer to detect a free/stale lock (enables take-over).
  const isViewer = state.role === "viewer";
  useEffect(() => {
    if (!isViewer) return;
    const id = setInterval(() => {
      void getCanvasLockAction(canvasId).then((lock) => {
        if (lock.heldBy === null || isLockStale(lock.heartbeatAt, Date.now())) {
          dispatch({ type: "lockFreed" });
        }
      });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [isViewer, canvasId]);

  const takeOver = useCallback(async () => {
    const r = await acquireCanvasLockAction(canvasId, sessionId, nameRef.current);
    if (r.ok) {
      dispatch({ type: "tookOver" });
      window.location.reload(); // reload to pick up the latest committed canvas
    }
  }, [canvasId, sessionId]);

  const reportLockLost = useCallback(() => dispatch({ type: "heartbeatLost" }), []);

  return {
    canEdit: isEditor,
    heldByName: state.heldByName,
    canTakeOver: state.canTakeOver,
    sessionId,
    takeOver,
    reportLockLost,
  };
}
