import { z } from "zod";
import { editorLockResponse } from "@/lib/editor/lock-guard";
import { tasks } from "@trigger.dev/sdk/v3";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";
import { getVersionById } from "@/lib/db/versions";
import { insertGeneration, failGeneration } from "@/lib/db/generations";
import { reserveCredits, refundReservation, CreditLimitError } from "@/lib/db/credit-transactions";
import { creditsFromUsd, creditSettingsAt } from "@/lib/credits/units";
import { pricingForNewRun, NO_PRICE_MESSAGE } from "@/lib/ai-models/run-price";
import { voiceChangeEstimateUsd } from "@/lib/ai-models/service-price";
import { VOICE_CHANGE_PRICE_MODEL_ID } from "@/lib/ai-models/service-models";
import { VoiceChangeSettingsSchema } from "@/lib/elevenlabs/voice-settings";
import { VOICE_CHECK_FAILED_MESSAGE, VOICE_GONE_MESSAGE, VOICE_NOT_SET_UP_MESSAGE } from "@/lib/elevenlabs/constants";
import { getVoiceCached } from "@/lib/elevenlabs/voices-cache";
import { isVoiceAvailableToClient } from "@/lib/elevenlabs/client-voices";
import { listClientVoiceIds } from "@/lib/db/client-voices";
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
  return withNode(req, params, { need: "generate" }, async (nodeId, _node, caller, clientId, effectiveOrgId) => {
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("Invalid voice change settings.", 400);
    const { baseVersionId, voiceId, settings } = parsed.data;
    // D390 — a voice change makes a new take: refused while the clip is in the Editor's reel.
    const locked = await editorLockResponse(nodeId);
    if (locked) return locked;
    if (!process.env.ELEVEN_LABS_API_KEY) return apiError(VOICE_NOT_SET_UP_MESSAGE, 400);

    // Independent reads run side by side (performance rule 5). D558 - ElevenLabs' row prices the
    // voice change; the generation still records the video's model.
    const [source, voiceRead, clientVoiceIds, { price, catalog }] = await Promise.all([
      resolveVoiceChangeSource(nodeId, baseVersionId, getVersionById),
      getVoiceCached(voiceId).then((voice) => ({ ok: true as const, voice }), () => ({ ok: false as const })),
      listClientVoiceIds(clientId),
      pricingForNewRun(VOICE_CHANGE_PRICE_MODEL_ID),
    ]);
    if (!source.ok) return apiError(source.reason, 400);
    if (!voiceRead.ok) return apiError(VOICE_CHECK_FAILED_MESSAGE, 400);
    const voice = voiceRead.voice;
    if (!voice) return apiError(VOICE_GONE_MESSAGE, 400);
    // The voice id comes from the body: a stock voice or one of this client's own, never another
    // client's clone (any agency). A 404, as for the avatar voice, never confirming a foreign voice.
    if (!isVoiceAvailableToClient(voice, clientVoiceIds)) {
      return apiError("Voice not found.", 404);
    }

    const voiceChange: VoiceChangeRecord = {
      baseVersionId,
      rootVersionId: source.root.id,
      sourceUrl: source.sourceUrl,
      voiceId,
      voiceName: voice.name,
      priceMultiplier: voice.priceMultiplier,
      settings,
    };
    if (!price) return apiError(NO_PRICE_MESSAGE, 409);
    const usd = voiceChangeEstimateUsd(price, source.durationSeconds, voice.priceMultiplier);
    if (usd === null) return apiError(NO_PRICE_MESSAGE, 409);

    const generation = await insertGeneration({
      nodeId,
      orgId: effectiveOrgId,
      clientId,
      userId: caller.userId,
      userEmail: caller.email,
      type: "voice",
      modelUsed: source.root.model_used ?? undefined,
      modelPriceId: price.id,
      paramsSnapshot: source.root.params_used ?? {},
      inputsSnapshot: { ...(source.root.inputs_used ?? {}), voiceChange },
    });

    try {
      const credits = creditsFromUsd(usd, creditSettingsAt(catalog, new Date(generation.created_at)));
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
