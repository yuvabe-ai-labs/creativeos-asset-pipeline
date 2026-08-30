import { NextRequest } from "next/server";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { ensureSystemBoards } from "@/lib/db/moodboards";
import { ingestReference } from "@/lib/market/ingest";
import { MARKET_BUCKETS, type MarketBucket } from "@/lib/market/constants";
import { resolveCallerContext } from "@/lib/dal";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) => {
    let body: { url?: string; bucket?: string; note?: string };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }
    const url = body.url?.trim();
    if (!url) return apiError("url is required", 400);
    if (!MARKET_BUCKETS.includes(body.bucket as MarketBucket)) {
      return apiError("bucket must be 'direct' or 'adjacent'", 400);
    }
    return withTryCatch("Could not add the reference.", async () => {
      const boards = await ensureSystemBoards(clientId);
      const board = body.bucket === "direct" ? boards.direct : boards.adjacent;
      const { userId } = await resolveCallerContext();
      const item = await ingestReference({
        boardId: board.id,
        clientId,
        url,
        note: body.note?.trim() || undefined,
        addedBy: userId,
      });
      return apiOk({ item }, 201);
    });
  });
}
