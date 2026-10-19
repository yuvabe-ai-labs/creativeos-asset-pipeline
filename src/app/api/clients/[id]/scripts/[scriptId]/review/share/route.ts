// src/app/api/clients/[id]/scripts/[scriptId]/review/share/route.ts
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getScript } from "@/lib/db/scripts";
import { shareNow } from "@/lib/script-review/share-now";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

// POST /api/clients/:id/scripts/:scriptId/review/share (spec 4 §3 steps 2–4). Freezes the script as it
// is now, with its avatars and storyboard (one way to share, D386), as the next version on the
// script's one link. Takes no body; a scope an older page still sends is ignored.
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not share the script.", async () => {
      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      // In review is reachable only from Visualise, so this also means "after Mark final" (spec 2 §8).
      if (script.stage !== "in_review") return apiError("Move the script to In review to share it.", 409);

      const shared = await shareNow({ clientId, script, caller: await resolveCallerContext() });
      if (!shared.ok) return apiError(shared.error, shared.status);
      return apiOk({ version: shared.version, shareToken: shared.shareToken }, 201);
    }),
  );
}
