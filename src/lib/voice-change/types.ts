// D282 — shapes passed between the route, the video-generate task, the video-voice-change task
// and completeGeneration.
import type { VoiceChangeSettings } from "@/lib/elevenlabs/voice-settings";

/** Recorded on the webhook `meta` and on the version's `params_used.voice`. */
export type VoiceMeta = {
  voiceId: string;
  voiceName: string;
  status: "applied" | "failed";
  error?: string;
  originalUrl: string;
  /** ≥ 1; D283. */
  priceMultiplier: number;
};

export type RevoicePayload = {
  sourceUrl: string;
  voiceId: string;
  revoicedPutUrl: string;
  settings: VoiceChangeSettings;
};
