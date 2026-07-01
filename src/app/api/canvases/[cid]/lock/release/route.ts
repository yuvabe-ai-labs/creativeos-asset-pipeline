import { apiOk, apiError } from "@/lib/api/route-helpers";
import { releaseCanvasLock } from "@/lib/db/canvas-lock";

// sendBeacon target — best-effort lock release when a tab closes. Server actions
// can't be beaconed, so this is a plain route handler.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ cid: string }> },
) {
  const { cid } = await params;
  const body = (await req.json().catch(() => ({}))) as { sessionId?: unknown };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  if (!sessionId) return apiError("sessionId is required.", 400);
  await releaseCanvasLock(cid, sessionId);
  return apiOk({ released: true });
}
