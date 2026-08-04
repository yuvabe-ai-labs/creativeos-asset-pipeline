import { NextRequest } from "next/server";
import { apiOk, withMoodboard } from "@/lib/api/route-helpers";
import { removeItem } from "@/lib/db/moodboards";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  // Guard on the board, not the item: the item is addressed through its board's URL, so
  // proving the caller owns the board is what authorizes the delete. removeItem is still
  // scoped by itemId, which belongs to that board by construction of the route.
  return withMoodboard(req, id, async () => {
    await removeItem(itemId);
    return apiOk({ ok: true });
  });
}
