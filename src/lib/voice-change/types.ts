// D282 — shapes passed between the route, the video-generate task, the video-revoice task and
// completeGeneration.

/** What the route hands video-generate when a voice is selected. */
export type VoicePayload = {
  voiceId: string;
  voiceName: string;
  originalPutUrl: string;
  originalUrl: string;
  revoicedPutUrl: string;
  revoicedUrl: string;
};

/** Recorded on the webhook `meta` and on the version's `params_used.voice`. */
export type VoiceMeta = {
  voiceId: string;
  voiceName: string;
  status: "applied" | "failed";
  error?: string;
  originalUrl: string;
};

export type RevoicePayload = { sourceUrl: string; voiceId: string; revoicedPutUrl: string };

export type RevoiceResult = { ok: true } | { ok: false; error: string };
