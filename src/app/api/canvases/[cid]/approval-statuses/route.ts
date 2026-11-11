import { listCanvasApprovalStatuses } from "@/lib/db/review";
import { apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";

// R8.3: the current approval status of every asset node on this canvas, so open canvases
// can keep their badges live (D202). The sibling of ./review — same view, same org
// isolation via withCanvas (404, never 403). Seeing a status needs only canvas view; deciding
// is the privilege (R6.7).
//
// Unpaged and deliberately tiny (three columns per asset node). It is fetched on a realtime
// ping, so the cost that matters is per-EVENT, not per-node: one request refreshes the
// whole canvas however many nodes changed in the burst.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ cid: string }> },
) {
  const { cid } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), { need: "canvases.view" }, async (canvasId, _canvas, _caller, orgId) =>
    withTryCatch("Failed to load approval statuses", async () => {
      // { statuses, outputs } — outputs keeps the card's media live too (BUG-002).
      return apiOk(await listCanvasApprovalStatuses(orgId, canvasId));
    }),
  );
}
