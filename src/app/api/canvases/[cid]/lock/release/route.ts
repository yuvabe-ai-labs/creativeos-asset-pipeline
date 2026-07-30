import { apiOk, apiError, withCanvas } from "@/lib/api/route-helpers";
import { releaseCanvasLock } from "@/lib/db/canvas-lock";

// sendBeacon target — best-effort lock release when a tab closes. Server actions
// can't be beaconed, so this is a plain route handler.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ cid: string }> },
) {
  const body = (await req.json().catch(() => ({}))) as { sessionId?: unknown };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  if (!sessionId) return apiError("sessionId is required.", 400);

  const { cid } = await params;
  return withCanvas(Promise.resolve({ id: cid }), async (canvasId) => {
    await releaseCanvasLock(canvasId, sessionId);
    return apiOk({ released: true });
  });
}
