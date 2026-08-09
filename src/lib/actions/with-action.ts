import "server-only";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { logImpersonationEvent } from "@/lib/db/impersonation-audit";

// Stage 4 write-gate for server actions (D101) — the action-side counterpart to
// route-helpers.ts's assertImpersonationWriteAllowed(). Server actions have no
// req.method to branch on (every action IS a write by convention), so this
// unconditionally blocks non-elevated impersonation and logs elevated writes.
// Unlike the route-helper gate, this THROWS rather than returning an error value,
// matching this codebase's existing convention of server actions throwing plain
// Errors for invalid states (see renameCanvasAction, deleteKBDocumentAction, etc).
export async function withAction<T>(
  actionName: string,
  handler: () => Promise<T>,
): Promise<T> {
  const impersonation = await resolveImpersonationState();

  if (impersonation.isImpersonating && !impersonation.elevated) {
    throw new Error(
      "Read-only while impersonating — enter elevated mode to make changes.",
    );
  }

  const result = await handler();

  if (impersonation.isImpersonating && impersonation.elevated) {
    await logImpersonationEvent({
      operatorId: impersonation.operatorId,
      targetOrgId: impersonation.targetOrgId,
      eventType: "write_action",
      detail: { action: actionName },
    });
  }

  return result;
}
