// D282 — ElevenLabs voice change. Prices from the ElevenAPI pricing page, checked 2026-09-24.
export const ELEVENLABS_API_BASE = "https://api.elevenlabs.io";
export const VOICE_CHANGE_MODEL_ID = "eleven_multilingual_sts_v2";
export const VOICE_CHANGE_USD_PER_MINUTE = 0.12;

/** Voices we created on the account (cloned / designed / professional) — listed before stock. */
export const CUSTOM_VOICE_CATEGORIES = new Set(["cloned", "generated", "professional"]);

export const VOICES_CACHE_TTL_MS = 5 * 60 * 1000;

export const VOICE_NOT_SET_UP_MESSAGE =
  "Voice change isn't set up — ELEVEN_LABS_API_KEY is missing.";
