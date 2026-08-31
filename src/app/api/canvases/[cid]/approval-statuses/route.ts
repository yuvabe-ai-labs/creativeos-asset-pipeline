import { listCanvasApprovalStatuses } from "@/lib/db/review";
import { resolveOrgId } from "@/lib/dal";
import { apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";

// R8.3: the current approval status of every asset node on this canvas, so open canvases
// can keep their badges live (D202). The sibling of ./review — same view, same org
// isolation via withCanvas (404, never 403), no role check for the same reason: seeing a
// status is not a privilege, only deciding is (R6.7).
//
// Unpaged and deliberately tiny (two columns per asset node). It is fetched on a realtime
// ping, so the cost that matters is per-EVENT, not per-node: one request refreshes the
// whole canvas however many nodes changed in the burst.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ cid: string }> },
) {
  const { cid } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId) =>
    withTryCatch("Failed to load approval statuses", async () => {
      const orgId = await resolveOrgId();
      return apiOk({ statuses: await listCanvasApprovalStatuses(orgId, canvasId) });
    }),
  );
}
