"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { toast } from "sonner";
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
import { trackConnection } from "@/lib/canvas/connection-status";
import { getLockSessionId } from "@/lib/canvas/lock-session";

const POLL_MS = 10_000;

// D33: acquires a per-tab lock on the canvas, heartbeats while editing, releases on
// unload, and polls for take-over while read-only.
//
// Acquisition is unconditional. D161 briefly made it opt-out (`acquire: false`) so a senior
// arriving via a review link would not evict a junior mid-generation, but that left two
// entry paths into the same canvas obeying different locking rules, which proved hard to
// reason about in practice — so it is DEFERRED and the single rule is back (see the ADR
// log). What survives from that work is separate and still stands: *approval* does not
// require canEdit, so a senior can sign off from a read-only session (D160, and the focus
// views' canApprove).
export function useCanvasLock(canvasId: string) {
  const { identity } = useIdentity();
  const [state, dispatch] = useReducer(lockReducer, INITIAL_LOCK_STATE);

  // Per-tab and stable across reloads — takeOver() reloads the page, and a fresh id
  // here would leave the reloaded tab unable to re-acquire the lock it just took.
  const sessionIdRef = useRef<string | null>(null);
  if (sessionIdRef.current === null) sessionIdRef.current = getLockSessionId(canvasId);
  const sessionId = sessionIdRef.current;

  const nameRef = useRef<string | null>(identity?.name ?? null);
  nameRef.current = identity?.name ?? null;

  // Acquire on mount.
  useEffect(() => {
    let cancelled = false;
    void trackConnection(() =>
      acquireCanvasLockAction(canvasId, sessionId, nameRef.current),
    ).then((r) => {
      if (cancelled || !r) return; // null = server unreachable; leave state, badge shows offline
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
      void trackConnection(() => heartbeatCanvasLockAction(canvasId, sessionId)).then((r) => {
        // null = unreachable (offline, NOT a lost lock). Only a real {ok:false} means
        // someone else took the lock, which flips us to read-only.
        if (r && !r.ok) dispatch({ type: "heartbeatLost" });
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
      void trackConnection(() => getCanvasLockAction(canvasId)).then((lock) => {
        if (!lock) return; // unreachable; badge shows offline, poll retries next tick
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
      return;
    }
    // A denied take-over used to be silent, so the button looked broken.
    if ("reason" in r && r.reason === "read-only") {
      toast.error("Editing is disabled", {
        description:
          "You're viewing as another organization. Enable editing in the banner to take over.",
        id: "impersonation-read-only",
      });
      return;
    }
    toast.error("Couldn't take over editing", {
      description: r.heldBy.name
        ? `${r.heldBy.name} is still editing this canvas.`
        : "Another session is still editing this canvas.",
    });
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
