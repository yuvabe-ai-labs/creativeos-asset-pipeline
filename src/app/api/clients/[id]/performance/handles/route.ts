import { NextRequest } from "next/server";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { listTrackedHandles, addTrackedHandle, getLatestSnapshot } from "@/lib/db/performance";
import { parseInstagramHandle, type FirstSnapshotOutcome } from "@/lib/market/performance";
import { snapshotHandle } from "@/lib/market/snapshot";

/** The handle sub-tab strip (D253). Handles and nothing else — Performance does not
 *  read Brand Kit (D252), so there is no suggestion field for a caller to depend on. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load tracked handles.", async () => {
      const handles = await listTrackedHandles(clientId);
      return apiOk({ handles });
    }),
  );
}

/** Enrols a handle. Canonicalizes first, so `@Foo`, `foo` and a pasted profile URL all
 *  become one row — and so the value stored is the one the scraper will request.
 *
 *  Then takes the first snapshot inline (D275): the user typed the handle and clicked
 *  Track, and the only thing the old "First snapshot pending — Refresh" empty state
 *  achieved was a second click. The row saves first and always; the snapshot outcome
 *  rides along on the 201 and never turns a successful add into an error. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not add that handle.", async () => {
      const body = (await req.json().catch(() => null)) as { handle?: unknown } | null;
      const raw = typeof body?.handle === "string" ? body.handle : null;
      const handle = parseInstagramHandle(raw);
      if (!handle) {
        return apiError("That doesn't look like an Instagram handle.", 400);
      }
      // addTrackedHandle upserts, so a double-submitted dialog returns the existing
      // row rather than failing on the unique key.
      const row = await addTrackedHandle(clientId, handle);
      const snapshot = await takeFirstSnapshot(clientId, handle);
      return apiOk({ handle: row, snapshot }, 201);
    }),
  );
}

// Skips the re-add case: unenrolling keeps history (D253), so a handle that already has
// snapshots must not spend a result charge just for coming back.
async function takeFirstSnapshot(clientId: string, handle: string): Promise<FirstSnapshotOutcome> {
  try {
    if (await getLatestSnapshot(clientId, handle)) return "ok";
    const result = await snapshotHandle(clientId, handle);
    return result.ok ? "ok" : "no-data";
  } catch (e) {
    console.error(`[performance] first snapshot failed for @${handle}:`, e);
    return "error";
  }
}
