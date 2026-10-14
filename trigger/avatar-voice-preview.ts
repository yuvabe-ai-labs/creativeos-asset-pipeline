import { task, logger, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import {
  runNativeVoicePreview, runVoicePreview, type AvatarVoicePreviewTaskPayload, type GenerateClip,
} from "@/lib/avatars/voice-preview-run";
import { VOICE_PREVIEW_ENGINE } from "@/lib/avatars/voice-preview";
import { fetchBytes, putBytes } from "@/lib/voice-change/http";
import { extractAudio, extractVoiceReference, replaceAudio, probeDurationSeconds } from "@/lib/media/ffmpeg";
import { speechToSpeech } from "@/lib/elevenlabs/client";
import { videoDownloadHeaders } from "@/lib/video-gen/download-headers";
import { postGenerationWebhook, postGenerationWebhookSafely, assertWebhookConfig } from "@/lib/generations/post-webhook";

/** The engine for this mode, resolved through the registry. Dynamic, because the registry and
 *  every provider under it carry `server-only` — a Next.js sentinel this build must not see
 *  statically (the same reason trigger/video-generate.ts imports it this way). */
async function clipGenerator(modelId: string): Promise<GenerateClip> {
  const { videoGenRegistry } = await import("@/lib/video-gen/registry");
  const config = videoGenRegistry[modelId];
  if (!config) throw new Error(`Unknown video model: ${modelId}`);
  return (input) => config.generate({ ...input, referenceUrls: input.referenceUrls ?? [] });
}

// D294, D296 — an avatar's voice preview, in whichever mode the avatar's declaration asked for:
//
//   named  — Gemini Omni animates the front image, then the clip is re-voiced with the avatar's
//            ElevenLabs voice, and the result is stored at the URL the route signed.
//   native — Seedance (Seedream face) or Gemini Omni (any other face) draws the front image
//            speaking, inventing a voice; the clip is stored and its voice extracted to a mono
//            mp3, which becomes the avatar's reference audio and its auto voice (D301).
//
// The route reserved the credits for whatever the mode costs.
//
// ONE attempt. A retried run would generate — and pay for — the clip again; the ElevenLabs step
// has its own retry inside runVoicePreview, against the same clip. maxDuration covers a Seedance
// render (about 90 s) with room to spare, and stays well inside the 15 minutes after which the
// Studio treats a still-running preview as lost. Concurrency 1: these share the ElevenLabs
// speech-to-speech limit with video-voice-change.
export const avatarVoicePreviewTask = task({
  id: "avatar-voice-preview",
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 1 },
  run: async (payload: AvatarVoicePreviewTaskPayload) => {
    // Fail fast on a misconfigured deploy — before the paid generation.
    assertWebhookConfig();
    const { generationId, mode } = payload;
    logger.info("Generating avatar voice preview", { generationId, mode });

    let durationSeconds: number;
    let meta: Record<string, unknown>;
    let clipUrl: string;
    try {
      // A named voice is always re-voiced on Omni; the engine's own voice follows the face (D301).
      const modelId = VOICE_PREVIEW_ENGINE[payload.mode === "native" ? payload.engine : "omni"].modelId;
      const generateClip = await clipGenerator(modelId);

      if (mode === "native") {
        const result = await runNativeVoicePreview(payload, {
          generateClip,
          fetchBytes: (url) => fetchBytes(url, videoDownloadHeaders(modelId)),
          extractVoiceReference,
          probeDurationSeconds,
          putBytes,
        });
        ({ durationSeconds } = result);
        clipUrl = payload.clipUrl;
        // The webhook records this on the avatar as its reference audio.
        meta = { voiceSample: result.sample };
      } else {
        const result = await runVoicePreview(payload, {
          generateClip,
          // Omni returns a Google Files URI, which needs the API key to download.
          fetchBytes: (url) => fetchBytes(url, videoDownloadHeaders(modelId)),
          extractAudio,
          speechToSpeech: (args) => speechToSpeech(args),
          probeDurationSeconds,
          replaceAudio,
          putBytes,
          wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        });
        ({ durationSeconds } = result);
        clipUrl = payload.revoicedUrl;
        meta = { voiceChange: { driftMs: result.driftMs } };
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : "Voice preview failed";
      logger.error("Avatar voice preview failed", { generationId, mode, error });
      // Safely: this post is the only record of why it failed, and what triggers the refund.
      await postGenerationWebhookSafely({ generationId, status: "failed", error }, "voice preview failure");
      throw new AbortTaskRunError(error);
    }

    try {
      await postGenerationWebhook({
        generationId,
        status: "succeeded",
        stored: true,
        videoUrl: clipUrl,
        durationSeconds,
        meta,
      });
    } catch (e) {
      // The preview is stored and the provider has billed; say where it is.
      throw new AbortTaskRunError(
        `Preview made but the webhook was unreachable — videoUrl=${clipUrl}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
});
