"use server";

import {
  acquireCanvasLock,
  heartbeatCanvasLock,
  releaseCanvasLock,
  getCanvasLock,
} from "@/lib/db/canvas-lock";
import { resolveImpersonationState } from "@/lib/auth/impersonation";

// Lock actions are per-editor-session bookkeeping (who currently holds the edit lock),
// not tenant business data — deliberately NOT gated by withAction() (Stage 4). Gating
// acquireCanvasLockAction would throw on every canvas open while impersonating
// read-only, breaking the primary "just look around" flow; gating the 15s heartbeat
// would flood the audit trail. See docs/superpowers/plans/2026-08-09-impersonation-stage4-fixes-2.md.
//
// acquireCanvasLockAction still needs its own narrow check (round 3): a read-only
// impersonating operator must never actually take a real tenant's edit lock — that
// locks the tenant's own users out and shows the operator's name as "editing" in their
// UI. This is a purpose-built no-op, not withAction(): it returns gracefully (matching
// acquireCanvasLock's "denied" shape) instead of throwing, and logs no audit event
// since nothing is written.

export async function acquireCanvasLockAction(
  canvasId: string,
  sessionId: string,
  name: string | null,
) {
  const impersonation = await resolveImpersonationState();
  if (impersonation.isImpersonating && !impersonation.elevated) {
    // Read-only impersonation: report the current lock state as a "denied" acquire
    // (getCanvasLock's shape differs — heldBy can be null — so map it onto
    // acquireCanvasLock's { ok: false; heldBy: { name } } denial shape rather than
    // returning getCanvasLock's raw result) so the hook's existing denied-lock path
    // handles this with no new branching, without ever writing to the lock columns.
    const lock = await getCanvasLock(canvasId);
    // `reason` lets the client tell "you are read-only" apart from "someone else holds
    // it" — the two denials look identical otherwise, and Take-over silently did
    // nothing at all in the read-only case.
    return {
      ok: false as const,
      reason: "read-only" as const,
      heldBy: { name: lock.heldBy?.name ?? null },
    };
  }
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
