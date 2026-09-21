import { NextRequest } from "next/server";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { isHandleTracked, getLatestSnapshot } from "@/lib/db/performance";
import { snapshotHandle } from "@/lib/market/snapshot";
import { parseInstagramHandle } from "@/lib/market/performance";

// Apify is pay-per-result — no free spamming. The guard is PER HANDLE (D253): keyed to
// the client, one refresh would freeze every other sub-tab for an hour.
const MIN_INTERVAL_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not refresh performance data.", async () => {
      const body = (await req.json().catch(() => null)) as { handle?: unknown } | null;
      const handle = parseInstagramHandle(typeof body?.handle === "string" ? body.handle : null);
      if (!handle) return apiError("A handle is required.", 400);

      if (!(await isHandleTracked(clientId, handle))) {
        return apiError("That handle isn't tracked for this client.", 404);
      }

      const latest = await getLatestSnapshot(clientId, handle);
      if (latest && Date.now() - new Date(latest.captured_at).getTime() < MIN_INTERVAL_MS) {
        return apiError("A snapshot was taken within the last hour — try again later.", 429);
      }

      const result = await snapshotHandle(clientId, handle);
      if (!result.ok) {
        return apiError("Instagram returned no data for this handle.", 409);
      }
      return apiOk({ ok: true, postCount: result.postCount });
    }),
  );
}
