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
import { getLockSessionId, takeLockHandoff } from "@/lib/canvas/lock-session";

const POLL_MS = 10_000;

// D33: acquires a per-tab lock on the canvas, heartbeats while editing, releases on
// unload, and polls for take-over while read-only.
//
// D499: someone without canvases.edit opens the canvas WITHOUT the lock (`acquire: false`): view
// only, no heartbeat, no take-over poll, and they never evict the person editing. D201 removed
// D161's URL-dependent opt-out because nothing on screen said which mode you were in; this one
// depends on a permission, and the banner says so. If the permission arrives mid-session the
// effect below acquires; if it goes, the heartbeat effect's cleanup releases the lock.
// Approval still does not require canEdit (D160).
export function useCanvasLock(canvasId: string, { acquire = true }: { acquire?: boolean } = {}) {
  const { identity } = useIdentity();
  const [state, dispatch] = useReducer(lockReducer, INITIAL_LOCK_STATE);

  // Per-tab and stable across reloads — takeOver() reloads the page, and a fresh id
  // here would leave the reloaded tab unable to re-acquire the lock it just took.
  const sessionIdRef = useRef<string | null>(null);
  if (sessionIdRef.current === null) sessionIdRef.current = getLockSessionId(canvasId);
  const sessionId = sessionIdRef.current;

  const nameRef = useRef<string | null>(identity?.name ?? null);
  nameRef.current = identity?.name ?? null;

  // Acquire on mount (and when the permission to edit arrives).
  useEffect(() => {
    if (!acquire) return;
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
  }, [canvasId, sessionId, acquire]);

  const isEditor = acquire && isEditorState(state);

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
      // Also release on unmount (navigating away in-app), unless this tab is handing the lock
      // to the canvas's editor or back (D391): that page acquires with the same session id.
      if (!takeLockHandoff(canvasId)) release();
    };
  }, [isEditor, canvasId, sessionId]);

  // Poll while viewer to detect a free/stale lock (enables take-over).
  const isViewer = acquire && state.role === "viewer";
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
    viewOnly: !acquire,
    heldByName: state.heldByName,
    canTakeOver: state.canTakeOver,
    sessionId,
    takeOver,
    reportLockLost,
  };
}
