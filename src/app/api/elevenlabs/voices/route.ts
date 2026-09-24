import { apiError, apiOk } from "@/lib/api/route-helpers";
import { resolveCallerContextOrNull } from "@/lib/dal";
import { getVoicesCached } from "@/lib/elevenlabs/voices-cache";
import { ElevenLabsKeyMissingError } from "@/lib/elevenlabs/client";
import { VOICE_NOT_SET_UP_MESSAGE } from "@/lib/elevenlabs/constants";

export const dynamic = "force-dynamic";

// D282 — the Video Gen node's voice picker. The ElevenLabs key stays on the server.
export async function GET() {
  const caller = await resolveCallerContextOrNull();
  if (!caller) return apiError("Unauthorized.", 401);

  try {
    const voices = await getVoicesCached();
    return apiOk({ voices });
  } catch (e) {
    if (e instanceof ElevenLabsKeyMissingError) return apiError(VOICE_NOT_SET_UP_MESSAGE, 503);
    return apiError(e instanceof Error ? e.message : "Could not load ElevenLabs voices.", 502);
  }
}
