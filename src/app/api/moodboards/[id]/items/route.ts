import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { listItems, addItem } from "@/lib/db/moodboards";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: moodboardId } = await params;
  const items = await listItems(moodboardId);
  return apiOk({ items });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: moodboardId } = await params;
  let body: { imageUrl?: string; sourceUrl?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const imageUrl = body.imageUrl?.trim();
  if (!imageUrl) return apiError("imageUrl is required", 400);
  const item = await addItem(moodboardId, { imageUrl, sourceUrl: body.sourceUrl });
  return apiOk({ item }, 201);
}
