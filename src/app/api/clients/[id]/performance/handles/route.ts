import { NextRequest } from "next/server";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { listTrackedHandles, addTrackedHandle } from "@/lib/db/performance";
import { parseInstagramHandle } from "@/lib/market/performance";

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
 *  become one row — and so the value stored is the one the scraper will request. */
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
      return apiOk({ handle: row }, 201);
    }),
  );
}
