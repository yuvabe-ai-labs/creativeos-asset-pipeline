import { ElevenLabsHttpError } from "@/lib/elevenlabs/client";
import type { VoiceChangeSettings } from "@/lib/elevenlabs/voice-settings";
import type { RevoicePayload } from "./types";

export const MAX_SYNC_DRIFT_SECONDS = 0.25;
export const SYNC_DRIFT_MESSAGE = "The new voice came back out of sync, so nothing was changed.";

export type RevoiceDeps = {
  fetchBytes: (url: string) => Promise<Buffer>;
  extractAudio: (video: Buffer) => Promise<Buffer>;
  speechToSpeech: (args: { audio: Buffer; voiceId: string; settings: VoiceChangeSettings }) => Promise<Buffer>;
  probeDurationSeconds: (media: Buffer, ext: string) => Promise<number>;
  replaceAudio: (video: Buffer, audio: Buffer) => Promise<Buffer>;
  putBytes: (url: string, body: Buffer, contentType: string) => Promise<void>;
};

/**
 * D282 review fix — thrown for revoice failures that cannot succeed on a retry: the source video's
 * audio can't be extracted (no audio stream, or ffmpeg missing), ElevenLabs rejected the request with a 4xx other than 429
 * (rate limit, which IS worth retrying), or the re-voiced audio came back out of sync (D284).
 * video-voice-change.ts converts this into AbortTaskRunError so Trigger.dev's retry policy doesn't
 * burn the 15-minute stuck-reservation sweep window on something that will only fail the same way
 * again. Every other failure (network errors, 429, 5xx) rethrows unchanged and stays retryable.
 */
export class NonRetryableRevoiceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NonRetryableRevoiceError";
  }
}

/**
 * D282 — the video-voice-change task's steps. Throws on any failure: the task's own retry policy
 * re-runs just this, never the paid video generation.
 */
export async function revoiceVideo(payload: RevoicePayload, deps: RevoiceDeps): Promise<{ driftMs: number }> {
  const video = await deps.fetchBytes(payload.sourceUrl);

  let audio: Buffer;
  try {
    audio = await deps.extractAudio(video);
  } catch (e) {
    throw new NonRetryableRevoiceError(
      // Covers both "the clip has no audio stream" and "ffmpeg could not run at all" — neither
      // clears up on a retry, and the underlying message says which it was.
      `Could not extract the clip's audio: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }

  let voiced: Buffer;
  try {
    voiced = await deps.speechToSpeech({ audio, voiceId: payload.voiceId, settings: payload.settings });
  } catch (e) {
    if (e instanceof ElevenLabsHttpError && e.status !== 429 && e.status >= 400 && e.status < 500) {
      throw new NonRetryableRevoiceError(e.message, { cause: e });
    }
    throw e;
  }

  // D284 — ElevenLabs speech-to-speech doesn't guarantee matching duration; a voice that drifted
  // audibly out of sync with the picture is worse than no change at all, so nothing gets uploaded.
  const [sourceSeconds, voicedSeconds] = [
    await deps.probeDurationSeconds(audio, "mp3"),
    await deps.probeDurationSeconds(voiced, "mp3"),
  ];
  const drift = Math.abs(sourceSeconds - voicedSeconds);
  if (drift > MAX_SYNC_DRIFT_SECONDS) throw new NonRetryableRevoiceError(SYNC_DRIFT_MESSAGE);

  const final = await deps.replaceAudio(video, voiced);
  await deps.putBytes(payload.revoicedPutUrl, final, "video/mp4");
  return { driftMs: Math.round(drift * 1000) };
}
