import { NextRequest } from "next/server";
import { apiOk, withMoodboard } from "@/lib/api/route-helpers";
import { getItem, removeItem } from "@/lib/db/moodboards";
import { removeObject } from "@/lib/storage";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  // Guard on the board, not the item: the item is addressed through its board's URL, so
  // proving the caller owns the board is what authorizes the delete. removeItem is still
  // scoped by itemId, which belongs to that board by construction of the route.
  return withMoodboard(req, id, async () => {
    // Objects must not outlive their row. The thumbnail has leaked this way since
    // D185; the archived media would be a much larger leak, so both are cleaned up
    // here — best-effort, because a storage hiccup must never stop someone deleting
    // their own item. An orphaned object is recoverable; a row that will not delete
    // is not.
    const item = await getItem(itemId);
    for (const url of [item?.media_url, item?.thumbnail_url]) {
      if (!url) continue;
      try {
        await removeObject(url);
      } catch (e) {
        console.log(
          `[clip] delete: could not remove ${url} (${e instanceof Error ? e.message : e})`,
        );
      }
    }

    await removeItem(itemId);
    return apiOk({ ok: true });
  });
}
