import { z } from "zod";
import { tasks } from "@trigger.dev/sdk/v3";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";
import { getVersionById } from "@/lib/db/versions";
import { insertGeneration, failGeneration } from "@/lib/db/generations";
import { reserveCredits, refundReservation, CreditLimitError } from "@/lib/db/credit-transactions";
import { usdToFinalCredits } from "@/lib/credits/units";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { VoiceChangeSettingsSchema } from "@/lib/elevenlabs/voice-settings";
import { VOICE_NOT_SET_UP_MESSAGE } from "@/lib/elevenlabs/constants";
import { getVoiceCached } from "@/lib/elevenlabs/voices-cache";
import { resolveVoiceChangeSource } from "@/lib/voice-change/source";
import { signRevoicedVideoUrl } from "@/lib/storage";
import type { VoiceChangeRecord } from "@/lib/voice-change/types";

const BodySchema = z.object({
  baseVersionId: z.string().min(1),
  voiceId: z.string().min(1),
  settings: VoiceChangeSettingsSchema,
});

// D284 — Change voice on an existing version: a new `voice` generation that appends a version.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withNode(req, params, async (nodeId, _node, caller, clientId, effectiveOrgId) => {
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("Invalid voice change settings.", 400);
    const { baseVersionId, voiceId, settings } = parsed.data;
    if (!process.env.ELEVEN_LABS_API_KEY) return apiError(VOICE_NOT_SET_UP_MESSAGE, 400);

    const source = await resolveVoiceChangeSource(nodeId, baseVersionId, getVersionById);
    if (!source.ok) return apiError(source.reason, 400);

    let voice;
    try {
      voice = await getVoiceCached(voiceId);
    } catch {
      return apiError("Could not reach ElevenLabs to check the voice. Try again.", 400);
    }
    if (!voice) return apiError("That voice is no longer on the ElevenLabs account. Pick another voice.", 400);

    const voiceChange: VoiceChangeRecord = {
      baseVersionId,
      rootVersionId: source.root.id,
      sourceUrl: source.sourceUrl,
      voiceId,
      voiceName: voice.name,
      priceMultiplier: voice.priceMultiplier,
      settings,
    };
    const generation = await insertGeneration({
      nodeId,
      orgId: effectiveOrgId,
      clientId,
      userId: caller.userId,
      userEmail: caller.email,
      type: "voice",
      modelUsed: source.root.model_used ?? undefined,
      paramsSnapshot: source.root.params_used ?? {},
      inputsSnapshot: { ...(source.root.inputs_used ?? {}), voiceChange },
    });

    try {
      const credits = usdToFinalCredits(computeVoiceChangeCost(source.durationSeconds, voice.priceMultiplier).usd);
      const reservation = await reserveCredits(effectiveOrgId, generation.id, credits);
      if (!reservation.ok) throw new CreditLimitError("Monthly credit limit reached");
      const upload = await signRevoicedVideoUrl({ nodeId, generationId: generation.id });
      await tasks.trigger("video-voice-change", {
        generationId: generation.id,
        sourceUrl: source.sourceUrl,
        voiceId,
        settings,
        revoicedPutUrl: upload.putUrl,
        revoicedUrl: upload.url,
        durationSeconds: source.durationSeconds,
      });
      return apiOk({ generationId: generation.id }, 202);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Voice change failed";
      await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
      await refundReservation({ orgId: effectiveOrgId, generationId: generation.id }).catch(() => null);
      return apiError(message, e instanceof CreditLimitError ? 402 : 500);
    }
  });
}
