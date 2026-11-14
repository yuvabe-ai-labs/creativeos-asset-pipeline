import { z } from "zod";
import { apiError, apiOk, withClient } from "@/lib/api/route-helpers";
import { addClientVoice, listClientVoiceIds } from "@/lib/db/client-voices";
import { saveLibraryVoice } from "@/lib/elevenlabs/voice-catalog";
import { isOtherClientsClone } from "@/lib/elevenlabs/client-voices";
import { VOICE_SAVE_PENDING_MESSAGE } from "@/lib/elevenlabs/constants";
import {
  getAccountVoicesCached, getVoiceCached, invalidateAccountVoices,
} from "@/lib/elevenlabs/voices-cache";
import { elevenLabsRouteError } from "@/lib/elevenlabs/route-errors";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  publicOwnerId: z.string().min(1),
  voiceId: z.string().min(1),
  name: z.string().min(1).max(100),
});

// POST /api/clients/:id/voices/save — pick a Voice Library voice FOR THIS CLIENT (D292): save
// it to the ElevenLabs account (or reuse the copy already there, as /api/elevenlabs/voices/save
// does), then record it for the client so it appears under "This client".
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, { need: "edit" }, async (clientId, _client, caller) => {
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("Invalid request body.", 400);
    const body = parsed.data;

    try {
      const [account, clientVoiceIds] = await Promise.all([
        getAccountVoicesCached(),
        listClientVoiceIds(clientId),
      ]);
      // `v.voiceId === body.voiceId`: a saved copy can keep the Library voice_id itself
      // (observed live, see the account-wide save route), so originalVoiceId alone is not enough.
      let voice = account.find((v) => v.originalVoiceId === body.voiceId || v.voiceId === body.voiceId) ?? null;
      // That same match would find another client's clone by its own id: refused, never attached.
      if (voice && isOtherClientsClone(voice, clientVoiceIds)) return apiError("Voice not found.", 404);
      if (!voice) {
        const savedId = await saveLibraryVoice(body);
        invalidateAccountVoices(savedId);
        voice = await getVoiceCached(savedId);
        if (!voice) return apiError(VOICE_SAVE_PENDING_MESSAGE, 502);
      }
      await addClientVoice({
        clientId, voiceId: voice.voiceId, name: voice.name, source: "library", userId: caller.userId,
      });
      return apiOk({ voice });
    } catch (e) {
      return elevenLabsRouteError(e);
    }
  });
}
