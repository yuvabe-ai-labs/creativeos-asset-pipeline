import { task, logger, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { revoiceVideo, NonRetryableRevoiceError } from "@/lib/voice-change/revoice";
import { fetchBytes, putBytes } from "@/lib/voice-change/http";
import { extractAudio, replaceAudio, probeDurationSeconds } from "@/lib/media/ffmpeg";
import { speechToSpeech } from "@/lib/elevenlabs/client";
import { postGenerationWebhook, postGenerationWebhookSafely, assertWebhookConfig } from "@/lib/generations/post-webhook";
import type { RevoicePayload } from "@/lib/voice-change/types";

export type VoiceChangeTaskPayload = RevoicePayload & {
  generationId: string;
  revoicedUrl: string;
  durationSeconds: number;
};

const MAX_ATTEMPTS = 2;

// The re-voiced video is stored but its success report could not be delivered. Not reported as
// `failed`: that would refund and drop a stored, paid result (the stuck sweep settles it instead).
// Keeps AbortTaskRunError's name, which is how Trigger knows not to retry it.
class DeliveryFailedError extends AbortTaskRunError {}

// D284 — re-voices a stored version's ORIGINAL audio into a new version. The route resolved the
// source, reserved voice-only credits and signed the upload. maxDuration 120 × MAX_ATTEMPTS keeps
// a run inside the 15-minute stuck-reservation sweep; concurrency 2 matches the ElevenLabs plan's
// speech-to-speech limit (raise both together).
export const videoVoiceChangeTask = task({
  id: "video-voice-change",
  maxDuration: 120,
  retry: { maxAttempts: MAX_ATTEMPTS, minTimeoutInMs: 2000, maxTimeoutInMs: 15000, factor: 2 },
  queue: { concurrencyLimit: 2 },
  // `failed` is posted once the run has failed for good. onFailure is Trigger's own "no more
  // attempts" signal; counting attempts in the catch is not, since Trigger may skip a retry
  // (retries are off in dev, see trigger.config.ts).
  onFailure: async ({ payload, error }) => {
    if (error instanceof DeliveryFailedError) return;
    const message = error instanceof Error ? error.message : "Voice change failed";
    await postGenerationWebhookSafely({ generationId: payload.generationId, status: "failed", error: message }, "voice change failure");
  },
  run: async (payload: VoiceChangeTaskPayload) => {
    // Fail fast on a misconfigured deploy — before any download or ElevenLabs call.
    assertWebhookConfig();
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
      // Reported by onFailure once no attempt is left.
      if (e instanceof NonRetryableRevoiceError) throw new AbortTaskRunError(e.message);
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
      throw new DeliveryFailedError(
        `Voice changed but the webhook was unreachable — videoUrl=${payload.revoicedUrl}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
});
