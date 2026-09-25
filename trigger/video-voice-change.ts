import { task, logger, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { revoiceVideo, NonRetryableRevoiceError } from "@/lib/voice-change/revoice";
import { fetchBytes, putBytes } from "@/lib/voice-change/http";
import { extractAudio, replaceAudio, probeDurationSeconds } from "@/lib/media/ffmpeg";
import { speechToSpeech } from "@/lib/elevenlabs/client";
import { postGenerationWebhook, postGenerationWebhookSafely } from "@/lib/generations/post-webhook";
import type { RevoicePayload } from "@/lib/voice-change/types";

export type VoiceChangeTaskPayload = RevoicePayload & {
  generationId: string;
  revoicedUrl: string;
  durationSeconds: number;
};

// D284 — re-voices a stored version's ORIGINAL audio into a new version. The route resolved the
// source, reserved voice-only credits and signed the upload. maxDuration 120 × 2 attempts keeps a
// run inside the 15-minute stuck-reservation sweep; concurrency 2 matches the ElevenLabs plan's
// speech-to-speech limit (raise both together).
export const videoVoiceChangeTask = task({
  id: "video-voice-change",
  maxDuration: 120,
  retry: { maxAttempts: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 15000, factor: 2 },
  queue: { concurrencyLimit: 2 },
  run: async (payload: VoiceChangeTaskPayload, { ctx }) => {
    logger.info("Changing voice", { generationId: payload.generationId, voiceId: payload.voiceId });
    let driftMs: number;
    try {
      ({ driftMs } = await revoiceVideo(payload, {
        fetchBytes: (url) => fetchBytes(url),
        extractAudio,
        speechToSpeech: (args) => speechToSpeech(args),
        probeDurationSeconds,
        replaceAudio,
        putBytes,
      }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Voice change failed";
      const finalAttempt = e instanceof NonRetryableRevoiceError || ctx.attempt.number >= 2;
      if (finalAttempt) {
        await postGenerationWebhookSafely({ generationId: payload.generationId, status: "failed", error: message }, "voice change failure");
      }
      if (e instanceof NonRetryableRevoiceError) throw new AbortTaskRunError(message);
      throw e;
    }
    try {
      await postGenerationWebhook({
        generationId: payload.generationId,
        status: "succeeded",
        stored: true,
        videoUrl: payload.revoicedUrl,
        durationSeconds: payload.durationSeconds,
        meta: { voiceChange: { driftMs } },
      });
    } catch (e) {
      // The re-voiced video is stored; retrying would only pay ElevenLabs again.
      throw new AbortTaskRunError(
        `Voice changed but the webhook was unreachable — videoUrl=${payload.revoicedUrl}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
});
