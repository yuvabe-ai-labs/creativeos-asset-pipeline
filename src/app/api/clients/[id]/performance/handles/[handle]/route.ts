import { NextRequest } from "next/server";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { removeTrackedHandle } from "@/lib/db/performance";
import { parseInstagramHandle } from "@/lib/market/performance";

/** Unenrols a handle (D253). The handle's `account_snapshots` and `tracked_posts` rows
 *  are deliberately left behind: that history cannot be re-scraped, so an accidental
 *  removal must not destroy it. Re-adding the handle picks the series back up. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; handle: string }> },
) {
  const { handle: rawHandle } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not remove that handle.", async () => {
      // Canonicalize the path segment the same way it was canonicalized on the way in,
      // so a link carrying "@Foo" still targets the row stored as "foo".
      const handle = parseInstagramHandle(decodeURIComponent(rawHandle));
      if (!handle) return apiError("That doesn't look like an Instagram handle.", 400);
      await removeTrackedHandle(clientId, handle);
      return apiOk({ ok: true });
    }),
  );
}
