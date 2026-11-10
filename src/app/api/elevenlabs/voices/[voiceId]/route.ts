import { apiError, apiOk, withAccess } from "@/lib/api/route-helpers";
import { getVoiceCached } from "@/lib/elevenlabs/voices-cache";
import { elevenLabsRouteError } from "@/lib/elevenlabs/route-errors";

export const dynamic = "force-dynamic";

// D283 — the node's selected voice: name, preview and price multiplier, without loading a list.
export async function GET(req: Request, { params }: { params: Promise<{ voiceId: string }> }) {
  return withAccess(req, { need: "voices.view" }, async () => {
    const { voiceId } = await params;
    try {
      const voice = await getVoiceCached(voiceId);
      if (!voice) return apiError("That voice is no longer on the ElevenLabs account.", 404);
      return apiOk({ voice });
    } catch (e) {
      return elevenLabsRouteError(e);
    }
  });
}
