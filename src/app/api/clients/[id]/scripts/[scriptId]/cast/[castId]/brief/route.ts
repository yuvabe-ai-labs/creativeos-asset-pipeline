import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getScript } from "@/lib/db/scripts";
import { getActiveKBVersion } from "@/lib/db/kb";
import { buildParseContext } from "@/lib/kb/parse-context";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { briefFront } from "@/lib/avatars/brief";

type Ctx = { params: Promise<{ id: string; scriptId: string; castId: string }> };

// The instructions box takes 300 characters; a little room for anything pasted.
const Body = z.object({ instructions: z.string().max(1000) });

/** The shots a brief reads: enough to see the person's outfit and world, not the whole reel. */
const MAX_SHOTS = 8;

// POST /api/clients/:id/scripts/:scriptId/cast/:castId/brief { instructions } — D395: the cast
// member as the stored script describes them (never as the browser sends them), plus the
// operator's instructions, restated as what the front route draws a face from. D459 — with the
// reel around them: the shots they are in, the reel's place, and the brand and who it casts.
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId, castId } = await params;
  return withClient(req, params, async (clientId, client) =>
    withTryCatch("Could not describe the person.", async () => {
      const parsed = Body.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Invalid request body.", 400);
      const [script, kb] = await Promise.all([getScript(clientId, scriptId), getActiveKBVersion(clientId)]);
      if (!script) return apiError("Script not found.", 404);
      const member = script.doc.cast.find((c) => c.id === castId);
      if (!member) return apiError("That person is not in this script.", 404);
      const casting = kb ? buildParseContext(kb.output as TraceableBrandKB, ["casting"]) : "";
      const front = await briefFront({
        name: member.name,
        description: member.description,
        setting: script.doc.header.region,
        instructions: parsed.data.instructions,
        place: script.doc.context.settingAndCamera,
        shots: script.doc.shots.filter((s) => s.onScreen.includes(castId)).slice(0, MAX_SHOTS).map((s) => s.visual),
        brand: [client.name, casting].filter(Boolean).join("\n"),
      });
      return apiOk(front);
    }),
  );
}
