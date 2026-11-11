import { listCanvasPendingItems } from "@/lib/db/review";
import { apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import { parsePageParams } from "@/lib/review/page-params";

// R6.1: what is still awaiting review on THIS canvas. withCanvas enforces org isolation
// (404, never 403, on a foreign canvas id) and internal review view before anything is read,
// and hands the handler the agency being acted in.
//
// R6.7: the drawer is read-only without Approve. Seeing what is outstanding needs only
// internal review view; deciding is the privilege.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ cid: string }> },
) {
  const { cid } = await params;
  const page = parsePageParams(new URL(req.url).searchParams);
  return withCanvas(req, Promise.resolve({ id: cid }), { need: "internal_review.view" }, async (canvasId, _canvas, _caller, orgId) =>
    withTryCatch("Failed to load review items", async () => {
      const items = await listCanvasPendingItems(orgId, canvasId, page);
      // `hasMore` from a full page rather than a second count query — one extra fetch at
      // the end of a list is cheaper than counting on every page (PRD §8).
      return apiOk({ items, hasMore: items.length === page.limit });
    }),
  );
}
