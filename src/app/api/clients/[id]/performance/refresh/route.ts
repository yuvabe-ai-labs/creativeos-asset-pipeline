import { NextRequest } from "next/server";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getLatestSnapshot } from "@/lib/db/performance";
import { snapshotClientHandle } from "@/lib/market/snapshot";

const MIN_INTERVAL_MS = 60 * 60 * 1000; // Apify is pay-per-result — no free spamming.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not refresh performance data.", async () => {
      const latest = await getLatestSnapshot(clientId);
      if (latest && Date.now() - new Date(latest.captured_at).getTime() < MIN_INTERVAL_MS) {
        return apiError("A snapshot was taken within the last hour — try again later.", 429);
      }
      const result = await snapshotClientHandle(clientId);
      if (!result.ok) {
        return result.reason === "no-handle"
          ? apiError("No Instagram handle on the Brand Kit yet.", 409)
          : apiError("Instagram returned no data for this handle.", 409);
      }
      return apiOk({ ok: true, postCount: result.postCount });
    }),
  );
}
