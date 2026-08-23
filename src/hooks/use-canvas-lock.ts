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
// D161: `acquire: false` enters the canvas WITHOUT taking the edit lock — the review mode
// R7.2 requires. A senior opening a canvas to review must never flip a junior who is
// mid-generation into read-only; before this, acquisition happened on mount
// unconditionally, so merely ARRIVING evicted the editor.
//
// Scoped deliberately: everything else the lock protects stays single-writer under D33
// (R7.3). Only *entering to review* is decoupled here, and separately only *approval* no
// longer requires canEdit (see the focus views' canApprove).
export function useCanvasLock(canvasId: string, options?: { acquire?: boolean }) {
  const acquire = options?.acquire ?? true;
  const { identity } = useIdentity();
  const [state, dispatch] = useReducer(lockReducer, INITIAL_LOCK_STATE);

  // Per-tab and stable across reloads — takeOver() reloads the page, and a fresh id
  // here would leave the reloaded tab unable to re-acquire the lock it just took.
  const sessionIdRef = useRef<string | null>(null);
  if (sessionIdRef.current === null) sessionIdRef.current = getLockSessionId(canvasId);
  const sessionId = sessionIdRef.current;

  const nameRef = useRef<string | null>(identity?.name ?? null);
  nameRef.current = identity?.name ?? null;

  // Acquire on mount — unless this session entered to review (D161). The heartbeat,
  // release and poll effects below need no equivalent guard: they key off isEditor /
  // isViewer, and a non-acquiring session never becomes either, so they are already inert
  // in review mode.
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
