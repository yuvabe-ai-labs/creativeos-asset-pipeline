import { task, logger } from "@trigger.dev/sdk/v3";
import { revoiceVideo } from "@/lib/voice-change/revoice";
import { fetchBytes, putBytes } from "@/lib/voice-change/http";
import { extractAudio, replaceAudio } from "@/lib/media/ffmpeg";
import { speechToSpeech } from "@/lib/elevenlabs/client";
import type { RevoicePayload } from "@/lib/voice-change/types";

// D282 — called by video-generate with triggerAndWait. Its own retries re-run only the voice
// change; once they're exhausted, video-generate falls back to the original video.
export const videoRevoiceTask = task({
  id: "video-revoice",
  maxDuration: 300,
  retry: { maxAttempts: 3, minTimeoutInMs: 2000, maxTimeoutInMs: 15000, factor: 2 },
  run: async (payload: RevoicePayload) => {
    logger.info("Re-voicing video", { voiceId: payload.voiceId });
    await revoiceVideo(payload, {
      fetchBytes: (url) => fetchBytes(url),
      extractAudio,
      speechToSpeech: (args) => speechToSpeech(args),
      replaceAudio,
      putBytes,
    });
    return { ok: true as const };
  },
});
