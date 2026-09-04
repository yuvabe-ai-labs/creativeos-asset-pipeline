import { NextRequest } from "next/server";
import { apiError, apiOk, withMoodboard, withTryCatch } from "@/lib/api/route-helpers";
import { listItems, getMoodboardClientId } from "@/lib/db/moodboards";
import { ingestReference } from "@/lib/market/ingest";
import { resolveCallerContext } from "@/lib/dal";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withMoodboard(req, id, async (moodboardId) => {
    const items = await listItems(moodboardId);
    return apiOk({ items });
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withMoodboard(req, id, async (moodboardId) => {
    let body: { imageUrl?: string; pageUrl?: string; sourceUrl?: string; note?: string };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }
    // pageUrl is the page-level clip (reel/video/article); imageUrl the classic
    // right-click-an-image clip. Either way one ingest path classifies and previews.
    const url = (body.pageUrl ?? body.imageUrl)?.trim();
    if (!url) {
      console.log(`[clip] POST board=${moodboardId} rejected: body has neither imageUrl nor pageUrl`);
      return apiError("imageUrl or pageUrl is required", 400);
    }
    console.log(
      `[clip] POST board=${moodboardId} ${body.pageUrl ? "pageUrl" : "imageUrl"}=${url} note=${body.note ? "yes" : "no"}`,
    );

    return withTryCatch("Could not add the reference.", async () => {
      const clientId = await getMoodboardClientId(moodboardId);
      if (!clientId) return apiError("Moodboard not found.", 404);
      const { userId } = await resolveCallerContext();
      const item = await ingestReference({
        boardId: moodboardId,
        clientId,
        url,
        sourceUrl: body.sourceUrl?.trim() || (body.pageUrl ? url : undefined),
        note: body.note?.trim() || undefined,
        addedBy: userId,
      });
      console.log(
        `[clip] added item=${item.id} kind=${item.kind} thumbnail=${item.thumbnail_url ? "yes" : "none"}`,
      );
      return apiOk({ item }, 201);
    });
  });
}
