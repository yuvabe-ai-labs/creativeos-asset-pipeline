import { NextRequest } from "next/server";
import { apiError, apiOk, withMoodboard } from "@/lib/api/route-helpers";
import { getItem, removeItem } from "@/lib/db/moodboards";
import { removeObject } from "@/lib/storage";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  // The chokepoint checks the board in the URL, not the item beside it. The item must be on that
  // board before any row or file is touched: an item on another board (another client, any
  // agency) answers 404, and removeItem is scoped to the board as well.
  return withMoodboard(req, id, { need: "edit" }, async () => {
    const item = await getItem(itemId);
    if (!item || item.moodboard_id !== id) return apiError("Item not found.", 404);

    // Objects must not outlive their row. The thumbnail has leaked this way since
    // D185; the archived media would be a much larger leak, so both are cleaned up
    // here, best-effort, because a storage hiccup must never stop someone deleting
    // their own item. An orphaned object is recoverable; a row that will not delete
    // is not.
    for (const url of [item.media_url, item.thumbnail_url]) {
      if (!url) continue;
      try {
        await removeObject(url);
      } catch (e) {
        console.log(
          `[clip] delete: could not remove ${url} (${e instanceof Error ? e.message : e})`,
        );
      }
    }

    await removeItem(id, itemId);
    return apiOk({ ok: true });
  });
}
