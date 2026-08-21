import { listCanvasPendingItems } from "@/lib/db/review";
import { resolveOrgId } from "@/lib/dal";
import { apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";

// R6.1: what is still awaiting review on THIS canvas. withCanvas enforces org isolation
// (404, never 403, on a foreign canvas id) before anything is read; it does not hand the
// handler a caller, so the org is resolved separately.
//
// R6.7: no role check — the drawer is available to every role, read-only for a designer.
// Seeing what is outstanding is not a privilege; only deciding is.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ cid: string }> },
) {
  const { cid } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId) =>
    withTryCatch("Failed to load review items", async () => {
      const orgId = await resolveOrgId();
      return apiOk({ items: await listCanvasPendingItems(orgId, canvasId) });
    }),
  );
}
