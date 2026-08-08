"use server";

import {
  acquireCanvasLock,
  heartbeatCanvasLock,
  releaseCanvasLock,
  getCanvasLock,
} from "@/lib/db/canvas-lock";
import { withAction } from "@/lib/actions/with-action";

export async function acquireCanvasLockAction(
  canvasId: string,
  sessionId: string,
  name: string | null,
) {
  return withAction("acquireCanvasLockAction", async () => {
    return acquireCanvasLock(canvasId, sessionId, name);
  });
}

export async function heartbeatCanvasLockAction(canvasId: string, sessionId: string) {
  return withAction("heartbeatCanvasLockAction", async () => {
    return heartbeatCanvasLock(canvasId, sessionId);
  });
}

export async function releaseCanvasLockAction(canvasId: string, sessionId: string) {
  return withAction("releaseCanvasLockAction", async () => {
    await releaseCanvasLock(canvasId, sessionId);
  });
}

export async function getCanvasLockAction(canvasId: string) {
  return getCanvasLock(canvasId);
}
