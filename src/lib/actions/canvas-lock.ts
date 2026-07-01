"use server";

import {
  acquireCanvasLock,
  heartbeatCanvasLock,
  releaseCanvasLock,
  getCanvasLock,
} from "@/lib/db/canvas-lock";

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
