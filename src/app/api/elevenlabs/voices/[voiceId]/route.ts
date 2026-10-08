import { apiError, apiOk } from "@/lib/api/route-helpers";
import { resolveCallerContextOrNull } from "@/lib/dal";
import { getVoiceCached } from "@/lib/elevenlabs/voices-cache";
import { elevenLabsRouteError } from "@/lib/elevenlabs/route-errors";

export const dynamic = "force-dynamic";

// D283 — the node's selected voice: name, preview and price multiplier, without loading a list.
export async function GET(_req: Request, { params }: { params: Promise<{ voiceId: string }> }) {
  const caller = await resolveCallerContextOrNull();
  if (!caller) return apiError("Unauthorized.", 401);
  const { voiceId } = await params;
  try {
    const voice = await getVoiceCached(voiceId);
    if (!voice) return apiError("That voice is no longer on the ElevenLabs account.", 404);
    return apiOk({ voice });
  } catch (e) {
    return elevenLabsRouteError(e);
  }
}
