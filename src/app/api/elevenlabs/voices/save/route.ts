import { z } from "zod";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { resolveCallerContextOrNull } from "@/lib/dal";
import { saveLibraryVoice } from "@/lib/elevenlabs/voice-catalog";
import { getAccountVoicesCached, getVoiceCached, invalidateAccountVoices } from "@/lib/elevenlabs/voices-cache";
import { elevenLabsRouteError } from "@/lib/elevenlabs/route-errors";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  publicOwnerId: z.string().min(1),
  voiceId: z.string().min(1),
  name: z.string().min(1).max(100),
});

// D283 — picking a Library voice saves it to the account; the node then stores the ACCOUNT id.
export async function POST(req: Request) {
  const caller = await resolveCallerContextOrNull();
  if (!caller) return apiError("Unauthorized.", 401);
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("Invalid request body.", 400);
  const body = parsed.data;

  try {
    // Already saved (by anyone on the account)? Reuse it rather than add a duplicate.
    // `v.voiceId === body.voiceId` fallback: a saved copy can keep the Library voice_id itself
    // rather than getting a new one — observed live — so originalVoiceId alone isn't enough.
    const existing = (await getAccountVoicesCached()).find(
      (v) => v.originalVoiceId === body.voiceId || v.voiceId === body.voiceId,
    );
    if (existing) return apiOk({ voice: existing });

    const savedId = await saveLibraryVoice(body);
    invalidateAccountVoices(savedId);
    const voice = await getVoiceCached(savedId);
    if (!voice) return apiError("ElevenLabs saved the voice but it isn't on the account yet. Try again.", 502);
    return apiOk({ voice });
  } catch (e) {
    return elevenLabsRouteError(e);
  }
}
