import { apiError, apiOk, withAccess } from "@/lib/api/route-helpers";
import { getVoiceCached } from "@/lib/elevenlabs/voices-cache";
import { elevenLabsRouteError } from "@/lib/elevenlabs/route-errors";
import { CUSTOM_VOICE_CATEGORIES } from "@/lib/elevenlabs/constants";
import { agencyVoiceIds } from "@/lib/elevenlabs/agency-voices";

export const dynamic = "force-dynamic";

const NOT_FOUND = "That voice is no longer available.";

// D283 — the node's selected voice: name, preview and price multiplier, without loading a list.
// A custom voice is returned only when it belongs to a client the caller can see; another
// agency's clone answers 404 like a voice that is gone. Stock voices need no read.
export async function GET(req: Request, { params }: { params: Promise<{ voiceId: string }> }) {
  return withAccess(req, { need: "view" }, async (caller, orgId) => {
    const { voiceId } = await params;
    try {
      const voice = await getVoiceCached(voiceId);
      if (!voice) return apiError(NOT_FOUND, 404);
      if (CUSTOM_VOICE_CATEGORIES.has(voice.category) && !(await agencyVoiceIds(caller, orgId)).includes(voice.voiceId)) {
        return apiError(NOT_FOUND, 404);
      }
      return apiOk({ voice });
    } catch (e) {
      return elevenLabsRouteError(e);
    }
  });
}
