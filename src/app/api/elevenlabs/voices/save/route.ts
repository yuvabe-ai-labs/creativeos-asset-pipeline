import { z } from "zod";
import { apiError, apiOk, withAccess } from "@/lib/api/route-helpers";
import { saveLibraryVoice } from "@/lib/elevenlabs/voice-catalog";
import { getAccountVoicesCached, getVoiceCached, invalidateAccountVoices } from "@/lib/elevenlabs/voices-cache";
import { elevenLabsRouteError } from "@/lib/elevenlabs/route-errors";
import { isOtherClientsClone } from "@/lib/elevenlabs/client-voices";
import { agencyVoiceIds } from "@/lib/elevenlabs/agency-voices";
import { VOICE_SAVE_PENDING_MESSAGE } from "@/lib/elevenlabs/constants";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  publicOwnerId: z.string().min(1),
  voiceId: z.string().min(1),
  name: z.string().min(1).max(100),
});

// D283 — picking a Library voice saves it to the account; the node then stores the ACCOUNT id.
export async function POST(req: Request) {
  return withAccess(req, { need: "edit" }, async (caller, orgId) => {
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("Invalid request body.", 400);
    const body = parsed.data;

    try {
      // Already saved (by anyone on the account)? Reuse it rather than add a duplicate.
      // `v.voiceId === body.voiceId` fallback: a saved copy can keep the Library voice_id itself
      // rather than getting a new one (observed live), so originalVoiceId alone isn't enough.
      const existing = (await getAccountVoicesCached()).find(
        (v) => v.originalVoiceId === body.voiceId || v.voiceId === body.voiceId,
      );
      // That fallback also finds a clone by its own id. Another agency's clone is never returned
      // (its name carries that agency's client name); the agency's voices are read only then.
      if (existing && isOtherClientsClone(existing, []) && isOtherClientsClone(existing, await agencyVoiceIds(caller, orgId))) {
        return apiError("Voice not found.", 404);
      }
      if (existing) return apiOk({ voice: existing });

      const savedId = await saveLibraryVoice(body);
      invalidateAccountVoices(savedId);
      const voice = await getVoiceCached(savedId);
      if (!voice) return apiError(VOICE_SAVE_PENDING_MESSAGE, 502);
      return apiOk({ voice });
    } catch (e) {
      return elevenLabsRouteError(e);
    }
  });
}
