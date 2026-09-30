import { z } from "zod";
import { tasks } from "@trigger.dev/sdk/v3";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getAvatar } from "@/lib/db/avatars";
import { insertGeneration, failGeneration, getLatestAvatarVoicePreview } from "@/lib/db/generations";
import { reserveCredits, refundReservation, CreditLimitError } from "@/lib/db/credit-transactions";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { getVoiceCached } from "@/lib/elevenlabs/voices-cache";
import { VOICE_NOT_SET_UP_MESSAGE } from "@/lib/elevenlabs/constants";
import { DEFAULT_VOICE_CHANGE_SETTINGS } from "@/lib/elevenlabs/voice-settings";
import { signAvatarVoicePreviewUrl, signAvatarVoiceSampleUrl } from "@/lib/storage";
import { AVATAR_VOICE_PREVIEW_LINE_MAX, AVATAR_VOICE_PREVIEW_SLOT } from "@/lib/avatars/constants";
import {
  buildVoicePreviewPrompt, estimateVoicePreviewCredits, generationToVoicePreview,
  isVoicePreviewAbandoned, voicePreviewBlocker, voicePreviewMode, voicePreviewParams,
  VOICE_PREVIEW_ENGINE, VOICE_PREVIEW_TIMED_OUT_MESSAGE,
} from "@/lib/avatars/voice-preview";
import type { Avatar } from "@/lib/avatars/schema";
import type { GenerationRow } from "@/lib/db/types";
import type { AvatarVoicePreviewTaskPayload } from "@/lib/avatars/voice-preview-run";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; avatarId: string }> };

const BodySchema = z.object({
  line: z.string().trim().min(1).max(AVATAR_VOICE_PREVIEW_LINE_MAX),
});

/** The avatar's latest preview. One left "running" by a lost task or webhook is failed and
 *  refunded here, on read, so it stops blocking the next preview as soon as the Studio looks.
 *  The reconcile-stuck-generations sweep does the same on its own schedule; both are idempotent
 *  (refundReservation refunds a generation once). */
async function readLatestPreview(avatarId: string): Promise<GenerationRow | null> {
  const row = await getLatestAvatarVoicePreview(avatarId);
  if (!row || !isVoicePreviewAbandoned(row)) return row;
  await failGeneration({ generationId: row.id, error: VOICE_PREVIEW_TIMED_OUT_MESSAGE });
  await refundReservation({ orgId: row.org_id, generationId: row.id });
  return { ...row, status: "failed", error: VOICE_PREVIEW_TIMED_OUT_MESSAGE };
}

/** What the next preview would cost. A legacy custom-rate ElevenLabs voice costs a multiple of
 *  the standard rate (D283); Seedance's own voice has no such rate, so a native preview asks
 *  ElevenLabs nothing. Display-only, so an unreachable ElevenLabs falls back to the standard
 *  rate rather than failing the read. */
async function estimateFor(avatar: Avatar): Promise<number | null> {
  const mode = voicePreviewMode(avatar);
  if (!mode) return null;
  if (mode === "native") return estimateVoicePreviewCredits("native");
  const voice = avatar.voice?.mode === "named"
    ? await getVoiceCached(avatar.voice.voiceId).catch(() => null)
    : null;
  return estimateVoicePreviewCredits("named", voice?.priceMultiplier ?? 1);
}

// GET …/voice-preview — the latest preview in whatever state it is in (the Studio polls this
// while one is running) and what the next one would cost.
export async function GET(req: Request, { params }: Ctx) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load the voice preview.", async () => {
      const avatar = await getAvatar(clientId, avatarId);
      if (!avatar) return apiError("Avatar not found.", 404);
      const [row, estimateCredits] = await Promise.all([readLatestPreview(avatarId), estimateFor(avatar)]);
      return apiOk({ preview: row ? generationToVoicePreview(row) : null, estimateCredits });
    }),
  );
}

// POST …/voice-preview — start a preview (D294, D296). The declaration decides the engine: a
// named voice runs Gemini Omni and is re-voiced with it, the engine's own voice runs Seedance and
// that clip's voice is kept as the avatar's reference audio. Reserves the credits for the mode,
// signs its uploads and queues the task; the generation webhook settles or refunds.
export async function POST(req: Request, { params }: Ctx) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId, client) =>
    withTryCatch("Could not start the voice preview.", async () => {
      const parsed = BodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return apiError(`Write a line of up to ${AVATAR_VOICE_PREVIEW_LINE_MAX} characters for the avatar to say.`, 400);
      }

      const avatar = await getAvatar(clientId, avatarId);
      if (!avatar || avatar.archivedAt) return apiError("Avatar not found.", 404);
      const blocker = voicePreviewBlocker(avatar);
      const mode = voicePreviewMode(avatar);
      if (blocker || !mode || !avatar.front) {
        return apiError(blocker ?? "This avatar cannot have a preview yet.", 400);
      }
      // Only a named voice involves ElevenLabs at all.
      if (mode === "named" && !process.env.ELEVEN_LABS_API_KEY) {
        return apiError(VOICE_NOT_SET_UP_MESSAGE, 400);
      }

      const latest = await readLatestPreview(avatarId);
      if (latest?.status === "running") return apiError("A preview is already being generated.", 409);

      // A named voice is looked up so its name and rate are recorded with the generation, and so
      // one that has left the account is caught before anything is paid for.
      let voice: { voiceId: string; name: string; priceMultiplier: number } | null = null;
      if (mode === "named" && avatar.voice?.mode === "named") {
        const found = await getVoiceCached(avatar.voice.voiceId).catch(() => undefined);
        if (found === undefined) return apiError("Could not reach ElevenLabs to check the voice. Try again.", 400);
        if (!found) return apiError("That voice is no longer on the ElevenLabs account. Choose another voice.", 400);
        voice = found;
      }

      const caller = await resolveCallerContext();
      const line = parsed.data.line;
      const prompt = buildVoicePreviewPrompt(line, mode);
      const paramsSnapshot = voicePreviewParams(mode);
      const generation = await insertGeneration({
        avatarId,
        orgId: client.org_id,
        clientId,
        userId: caller.userId,
        userEmail: caller.email,
        type: "video",
        modelUsed: VOICE_PREVIEW_ENGINE[mode].modelId,
        paramsSnapshot,
        inputsSnapshot: {
          slot: AVATAR_VOICE_PREVIEW_SLOT,
          mode,
          line,
          prompt,
          frontUrl: avatar.front.url,
          ...(voice
            ? { voiceId: voice.voiceId, voiceName: voice.name, priceMultiplier: voice.priceMultiplier }
            : {}),
        },
      });

      try {
        const credits = estimateVoicePreviewCredits(mode, voice?.priceMultiplier ?? 1);
        if (credits === null) throw new Error("No cost estimate available for the voice preview.");
        const reservation = await reserveCredits(client.org_id, generation.id, credits);
        if (!reservation.ok) throw new CreditLimitError("Monthly credit limit reached");

        // The task has no GCS credentials, so every upload it makes is signed here. A native
        // preview writes two objects: the clip, and the voice extracted from it.
        const clip = await signAvatarVoicePreviewUrl({ clientId, avatarId, generationId: generation.id });
        let payload: AvatarVoicePreviewTaskPayload;
        if (mode === "native") {
          const sample = await signAvatarVoiceSampleUrl({ clientId, avatarId, generationId: generation.id });
          payload = {
            mode: "native",
            generationId: generation.id,
            frontUrl: avatar.front.url,
            prompt,
            params: paramsSnapshot,
            clipPutUrl: clip.putUrl,
            clipUrl: clip.url,
            samplePutUrl: sample.putUrl,
            sampleUrl: sample.url,
          };
        } else {
          payload = {
            mode: "named",
            generationId: generation.id,
            frontUrl: avatar.front.url,
            prompt,
            params: paramsSnapshot,
            voiceId: voice?.voiceId ?? "",
            settings: DEFAULT_VOICE_CHANGE_SETTINGS,
            revoicedPutUrl: clip.putUrl,
            revoicedUrl: clip.url,
          };
        }
        await tasks.trigger("avatar-voice-preview", payload);
        return apiOk({ preview: generationToVoicePreview(generation) }, 202);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Voice preview failed";
        await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
        await refundReservation({ orgId: client.org_id, generationId: generation.id }).catch(() => null);
        if (e instanceof CreditLimitError) return apiError(CREDIT_LIMIT_TOAST_MESSAGE, 402);
        return apiError(message, 500);
      }
    }),
  );
}
