import { apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import { listCanvasClientFeedback } from "@/lib/db/client-reviews";

// D309/D310: every Client review node on this canvas with its client-comment count, for the
// header's "Client feedback" chip. Same org isolation as ./approval-statuses (withCanvas:
// 404, never 403). Seeing feedback is not a privilege, so no role check.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ cid: string }> },
) {
  const { cid } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId) =>
    withTryCatch("Failed to load client feedback", async () =>
      apiOk(await listCanvasClientFeedback(canvasId)),
    ),
  );
}
