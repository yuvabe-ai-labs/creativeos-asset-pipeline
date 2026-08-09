"use server";

import {
  acquireCanvasLock,
  heartbeatCanvasLock,
  releaseCanvasLock,
  getCanvasLock,
} from "@/lib/db/canvas-lock";

// Lock actions are per-editor-session bookkeeping (who currently holds the edit lock),
// not tenant business data — deliberately NOT gated by withAction() (Stage 4). Gating
// acquireCanvasLockAction would throw on every canvas open while impersonating
// read-only, breaking the primary "just look around" flow; gating the 15s heartbeat
// would flood the audit trail. See docs/superpowers/plans/2026-08-09-impersonation-stage4-fixes-2.md.

export async function acquireCanvasLockAction(
  canvasId: string,
  sessionId: string,
  name: string | null,
) {
  return acquireCanvasLock(canvasId, sessionId, name);
}

export async function heartbeatCanvasLockAction(canvasId: string, sessionId: string) {
  return heartbeatCanvasLock(canvasId, sessionId);
}

export async function releaseCanvasLockAction(canvasId: string, sessionId: string) {
  await releaseCanvasLock(canvasId, sessionId);
}

export async function getCanvasLockAction(canvasId: string) {
  return getCanvasLock(canvasId);
}
