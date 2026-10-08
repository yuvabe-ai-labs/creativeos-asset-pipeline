import { apiError, apiOk, withClient } from "@/lib/api/route-helpers";
import {
  countOtherClientsWithVoice, listClientVoiceIds, listLiveAvatarNamesUsingVoice, removeClientVoice,
} from "@/lib/db/client-voices";
import { deleteVoice } from "@/lib/elevenlabs/voice-catalog";
import { invalidateAccountVoices } from "@/lib/elevenlabs/voices-cache";
import { elevenLabsRouteError } from "@/lib/elevenlabs/route-errors";

export const dynamic = "force-dynamic";

// DELETE /api/clients/:id/voices/:voiceId — remove a voice from this client (D292). Refused
// while a live avatar declares it. The ElevenLabs voice itself — and its slot on the shared
// account — is only deleted when no other client has the same voice recorded.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; voiceId: string }> },
) {
  const { voiceId } = await params;
  return withClient(req, params, async (clientId) => {
    try {
      // Not this client's voice (another client's, a stock voice, or unknown): a 404 either
      // way, never confirming that a foreign voice exists.
      if (!(await listClientVoiceIds(clientId)).includes(voiceId)) {
        return apiError("Voice not found.", 404);
      }
      const usedBy = await listLiveAvatarNamesUsingVoice(clientId, voiceId);
      if (usedBy.length > 0) {
        return apiError(`This voice is used by ${usedBy.join(", ")}. Change their voice first.`, 409);
      }
      // ElevenLabs first: if it refuses, the record stays and the operator can retry. The other
      // order would drop the record and leave a slot in use that nothing points at.
      if ((await countOtherClientsWithVoice(clientId, voiceId)) === 0) {
        await deleteVoice(voiceId);
        invalidateAccountVoices(voiceId);
      }
      await removeClientVoice(clientId, voiceId);
      return apiOk({ ok: true as const });
    } catch (e) {
      return elevenLabsRouteError(e);
    }
  });
}
