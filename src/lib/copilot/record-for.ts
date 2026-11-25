import type { RecordFor } from "@/lib/generations/record-for";
import type { VerifiedCanvas } from "@/lib/api/route-helpers";
import type { CallerContext } from "@/lib/dal";

/**
 * D560 — whom a canvas copilot call's cost is recorded for: the org, client and script of the
 * canvas the request names, once withBodyCanvas() has checked it is in the caller's org, and
 * the user who asked.
 */
export function copilotRecordFor(canvas: VerifiedCanvas, caller: CallerContext): RecordFor {
  return {
    orgId: canvas.orgId,
    clientId: canvas.clientId,
    scriptId: canvas.scriptId,
    userId: caller.userId,
    userEmail: caller.email,
  };
}
