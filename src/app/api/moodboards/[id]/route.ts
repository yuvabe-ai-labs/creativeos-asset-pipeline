import { NextRequest } from "next/server";
import { apiOk, withMoodboard } from "@/lib/api/route-helpers";
import { deleteMoodboard } from "@/lib/db/moodboards";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withMoodboard(req, id, async (moodboardId) => {
    await deleteMoodboard(moodboardId);
    return apiOk({ ok: true });
  });
}
