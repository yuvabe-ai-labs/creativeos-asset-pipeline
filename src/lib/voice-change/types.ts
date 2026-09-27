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

/**
 * D284 — the voice-change route's own record, stored on `generations.inputs_snapshot.voiceChange`
 * and carried onto the resulting version's `inputs_used.voiceChange`. Distinct from VoiceMeta
 * above (D282's generate-time voice, now dead): this is re-voicing an EXISTING version.
 */
export type VoiceChangeRecord = {
  baseVersionId: string;
  rootVersionId: string;
  sourceUrl: string;
  voiceId: string;
  voiceName: string;
  /** ≥ 1; D283. */
  priceMultiplier: number;
  settings: VoiceChangeSettings;
  /** Set by completeGeneration from the webhook's meta.voiceChange.driftMs. */
  driftMs?: number;
};
