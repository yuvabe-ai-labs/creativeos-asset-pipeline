import { z } from "zod";
import { apiError, apiOk, withClient } from "@/lib/api/route-helpers";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { listClientVoiceIds } from "@/lib/db/client-voices";
import { getVoiceCached } from "@/lib/elevenlabs/voices-cache";
import { isVoiceAvailableToClient } from "@/lib/elevenlabs/client-voices";
import { elevenLabsRouteError } from "@/lib/elevenlabs/route-errors";
import { preconditionFailed } from "@/lib/avatars/route-responses";
import { isVoiceAllowed, pickerVoiceToAvatarVoice } from "@/lib/avatars/voice";
import type { AvatarVoice } from "@/lib/avatars/schema";

export const dynamic = "force-dynamic";

const VoiceSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({ mode: z.literal("native") }),
  z.object({ mode: z.literal("named"), voiceId: z.string().min(1) }),
]);

const FRONT_CHANGED = "The front image changed. Choose the voice again.";

// PUT /api/clients/:id/avatars/:avatarId/voice — the avatar's voice declaration (D293): none,
// the engine's own voice, or a named ElevenLabs voice. A named voice is looked up on the account
// and must be this client's (or a stock voice); the browser sends only its id.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; avatarId: string }> },
) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId) => {
    const parsed = VoiceSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("Invalid request body.", 400);
    const choice = parsed.data;

    try {
      const current = await getAvatar(clientId, avatarId);
      if (!current || current.archivedAt) return apiError("Avatar not found.", 404);

      if (choice.mode === "none") {
        const avatar = await updateAvatar(clientId, avatarId, { voice: null });
        return avatar ? apiOk({ avatar }) : apiError("Avatar not found.", 404);
      }

      // What may be declared depends on the person type, which follows the front image.
      if (!current.front) return apiError("Add a front image before choosing a voice.", 400);

      let voice: AvatarVoice;
      if (choice.mode === "native") {
        voice = { mode: "native" };
      } else {
        const picked = await getVoiceCached(choice.voiceId);
        // Missing, or another client's: a 404 either way, never confirming a foreign voice.
        if (!picked || !isVoiceAvailableToClient(picked, await listClientVoiceIds(clientId))) {
          return apiError("Voice not found.", 404);
        }
        voice = pickerVoiceToAvatarVoice(picked);
      }
      if (!isVoiceAllowed(voice, current.personType)) {
        return apiError("A real person's avatar needs a named voice.", 400);
      }

      // Conditioned on the front that decided what was allowed: a front swap landing in between
      // could otherwise leave a native voice on what is now a real person.
      const avatar = await updateAvatar(clientId, avatarId, { voice }, { ifFrontUrl: current.front.url });
      if (!avatar) return preconditionFailed(clientId, avatarId, FRONT_CHANGED);
      return apiOk({ avatar });
    } catch (e) {
      return elevenLabsRouteError(e);
    }
  });
}
