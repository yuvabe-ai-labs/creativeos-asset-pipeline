// D282 — ElevenLabs voice change. Prices from the ElevenAPI pricing page, checked 2026-09-24.
export const ELEVENLABS_API_BASE = "https://api.elevenlabs.io";
export const VOICE_CHANGE_MODEL_ID = "eleven_multilingual_sts_v2";
export const VOICE_CHANGE_USD_PER_MINUTE = 0.12;

/** Voices we created on the account (cloned / designed / professional) — listed before stock. */
export const CUSTOM_VOICE_CATEGORIES = new Set(["cloned", "generated", "professional"]);

export const VOICE_NOT_SET_UP_MESSAGE =
  "Voice change isn't set up — ELEVEN_LABS_API_KEY is missing.";

// D283 — voice picker paging and caching.
export const ACCOUNT_VOICES_PAGE_SIZE = 100;
export const LIBRARY_PAGE_SIZE = 30;
export const ACCOUNT_VOICES_TTL_MS = 5 * 60 * 1000;
export const SINGLE_VOICE_TTL_MS = 5 * 60 * 1000;
export const LIBRARY_PAGE_TTL_MS = 60 * 1000;

/** ElevenLabs Voice Library filter values (the API's own vocabulary). */
export const LIBRARY_GENDERS = ["female", "male", "neutral"] as const;
export const LIBRARY_AGES = ["young", "middle_aged", "old"] as const;
export const LIBRARY_ACCENTS = [
  "indian", "american", "british", "australian", "african", "arabic", "irish", "canadian",
] as const;
export const LIBRARY_LANGUAGES = [
  { value: "hi", label: "Hindi" }, { value: "en", label: "English" }, { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" }, { value: "ml", label: "Malayalam" }, { value: "kn", label: "Kannada" },
  { value: "bn", label: "Bengali" }, { value: "mr", label: "Marathi" }, { value: "gu", label: "Gujarati" },
  { value: "pa", label: "Punjabi" },
] as const;
export const LIBRARY_USE_CASES = [
  "social_media", "advertisement", "conversational", "narrative_story", "informative_educational",
  "entertainment_tv", "characters_animation",
] as const;
export const LIBRARY_SORTS = [
  { value: "trending", label: "Trending" },
  { value: "cloned_by_count", label: "Most used" },
  { value: "created_date", label: "Newest" },
] as const;
