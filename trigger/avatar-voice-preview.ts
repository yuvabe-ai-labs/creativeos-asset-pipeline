import { task, logger, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { runVoicePreview, type AvatarVoicePreviewTaskPayload } from "@/lib/avatars/voice-preview-run";
import { VOICE_PREVIEW_MODEL_ID } from "@/lib/avatars/voice-preview";
import { fetchBytes, putBytes } from "@/lib/voice-change/http";
import { extractAudio, replaceAudio, probeDurationSeconds } from "@/lib/media/ffmpeg";
import { speechToSpeech } from "@/lib/elevenlabs/client";
import { videoDownloadHeaders } from "@/lib/video-gen/download-headers";
import { postGenerationWebhook, postGenerationWebhookSafely, assertWebhookConfig } from "@/lib/generations/post-webhook";

// D294 — an avatar's voice preview: Gemini Omni animates the front image speaking one line, then
// the clip's voice is replaced with the avatar's named ElevenLabs voice and the result is stored
// at the URL the route signed. The route reserved the credits for both halves.
//
// ONE attempt. A retried run would generate — and pay Google for — the clip again; the voice
// change has its own retry inside runVoicePreview, against the same clip. maxDuration covers a
// 6s/720p Omni render (about half a minute, synchronous) with room for a slow one, and stays well
// inside the 15 minutes after which the Studio treats a still-running preview as lost.
// Concurrency 1: these share the ElevenLabs speech-to-speech limit with video-voice-change.
export const avatarVoicePreviewTask = task({
  id: "avatar-voice-preview",
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 1 },
  run: async (payload: AvatarVoicePreviewTaskPayload) => {
    // Fail fast on a misconfigured deploy — before the paid Omni call.
    assertWebhookConfig();
    const { generationId } = payload;
    logger.info("Generating avatar voice preview", { generationId, voiceId: payload.voiceId });

    let result: { durationSeconds: number; driftMs: number };
    try {
      const { videoGenRegistry } = await import("@/lib/video-gen/registry");
      const omni = videoGenRegistry[VOICE_PREVIEW_MODEL_ID];
      if (!omni) throw new Error(`Unknown video model: ${VOICE_PREVIEW_MODEL_ID}`);
      result = await runVoicePreview(payload, {
        generateClip: (input) => omni.generate(input),
        // Omni returns a Google Files URI, which needs the API key to download.
        fetchBytes: (url) => fetchBytes(url, videoDownloadHeaders(VOICE_PREVIEW_MODEL_ID)),
        extractAudio,
        speechToSpeech: (args) => speechToSpeech(args),
        probeDurationSeconds,
        replaceAudio,
        putBytes,
        wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : "Voice preview failed";
      logger.error("Avatar voice preview failed", { generationId, error });
      // Safely: this post is the only record of why it failed, and what triggers the refund.
      await postGenerationWebhookSafely({ generationId, status: "failed", error }, "voice preview failure");
      throw new AbortTaskRunError(error);
    }

    try {
      await postGenerationWebhook({
        generationId,
        status: "succeeded",
        stored: true,
        videoUrl: payload.revoicedUrl,
        durationSeconds: result.durationSeconds,
        meta: { voiceChange: { driftMs: result.driftMs } },
      });
    } catch (e) {
      // The preview is stored and both providers have billed; say where it is.
      throw new AbortTaskRunError(
        `Preview made but the webhook was unreachable — videoUrl=${payload.revoicedUrl}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
});
