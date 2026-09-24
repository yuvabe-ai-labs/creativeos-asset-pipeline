import { task, logger, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { revoiceVideo, NonRetryableRevoiceError } from "@/lib/voice-change/revoice";
import { fetchBytes, putBytes } from "@/lib/voice-change/http";
import { extractAudio, replaceAudio } from "@/lib/media/ffmpeg";
import { speechToSpeech } from "@/lib/elevenlabs/client";
import type { RevoicePayload } from "@/lib/voice-change/types";

// D282 — called by video-generate with triggerAndWait. Its own retries re-run only the voice
// change; once they're exhausted, video-generate falls back to the original video.
//
// D282 review fix — maxDuration 120s x retry.maxAttempts 2 keeps every attempt (even a full
// timeout on both) inside the 15-minute stuck-reservation sweep window (trigger/
// reconcile-stuck-generations.ts), alongside video-generate's own budget. See §6 of
// docs/superpowers/specs/2026-09-24-elevenlabs-voice-change-design.md.
export const videoRevoiceTask = task({
  id: "video-revoice",
  maxDuration: 120,
  retry: { maxAttempts: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 15000, factor: 2 },
  // D282 review fix — ElevenLabs' Free plan allows 2 concurrent speech-to-speech requests; this
  // MUST match whatever plan the account is actually on, or ElevenLabs starts 429ing runs that
  // Trigger.dev believed were safe to start. Bump it (and re-check the plan's limit) before
  // upgrading the ElevenLabs plan.
  queue: { concurrencyLimit: 2 },
  run: async (payload: RevoicePayload) => {
    logger.info("Re-voicing video", { voiceId: payload.voiceId });
    try {
      await revoiceVideo(payload, {
        fetchBytes: (url) => fetchBytes(url),
        extractAudio,
        speechToSpeech: (args) => speechToSpeech(args),
        replaceAudio,
        putBytes,
      });
    } catch (e) {
      // Non-retryable: no audio stream to extract, or ElevenLabs rejected the request with a
      // 4xx that a retry can't fix (see revoice.ts). AbortTaskRunError skips the retry policy
      // above entirely, so triggerAndWait's caller (video-generate) gets the failure immediately
      // instead of after `retry.maxAttempts` repeats of the same failure.
      if (e instanceof NonRetryableRevoiceError) throw new AbortTaskRunError(e.message);
      throw e;
    }
    return { ok: true as const };
  },
});
