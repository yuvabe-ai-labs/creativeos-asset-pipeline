import { apiOk, withClient } from "@/lib/api/route-helpers";
import { listClientVoiceIds } from "@/lib/db/client-voices";
import { getAccountVoicesCached } from "@/lib/elevenlabs/voices-cache";
import { clientPickerVoices } from "@/lib/elevenlabs/client-voices";
import { elevenLabsRouteError } from "@/lib/elevenlabs/route-errors";

export const dynamic = "force-dynamic";

// GET /api/clients/:id/voices — the voice picker's "This client" tab (D292): the voices recorded
// for this client plus ElevenLabs' stock voices. Same response shape as the account list in
// /api/elevenlabs/voices, so the picker reads either.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) => {
    try {
      const [account, clientVoiceIds] = await Promise.all([
        getAccountVoicesCached(),
        listClientVoiceIds(clientId),
      ]);
      return apiOk({ voices: clientPickerVoices(account, clientVoiceIds), nextCursor: null });
    } catch (e) {
      return elevenLabsRouteError(e);
    }
  });
}
