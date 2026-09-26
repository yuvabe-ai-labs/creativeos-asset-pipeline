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
// Review fix — a misbehaving or malicious next_page_token chain must not loop forever;
// 50 pages is 5,000 account voices, far past anything a real account has.
export const ACCOUNT_VOICES_MAX_PAGES = 50;
// Review fix — the voices-cache maps are unbounded otherwise; cap entries and drop oldest.
export const VOICE_CACHE_MAX_ENTRIES = 500;

/** ElevenLabs Voice Library filter values (the API's own vocabulary). */
export const LIBRARY_GENDERS = ["female", "male", "neutral"] as const;
export const LIBRARY_AGES = ["young", "middle_aged", "old"] as const;
export const LIBRARY_ACCENTS = [
  "indian", "american", "british", "australian", "african", "arabic", "irish", "canadian",
] as const;
/**
 * Every language the Voice Library actually has voices in — checked live 2026-09-26 by querying
 * `/v1/shared-voices?language=<code>` for ~90 codes; only these 39 returned any (English 10,885,
 * Spanish 8,208, Hindi 6,886, Tamil 2,374 … Gujarati 3, Urdu 1). Punjabi, Odia, Assamese, Nepali,
 * Hebrew, Persian, Serbian, Swahili, Thai and ~40 others had none, so they aren't offered.
 * Indian languages first — who these ads are for — then the rest alphabetically. Also the
 * code → name map for every voice row (voice-labels.ts `languageName`).
 */
export const LIBRARY_LANGUAGES = [
  { value: "hi", label: "Hindi" }, { value: "en", label: "English" }, { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" }, { value: "mr", label: "Marathi" }, { value: "ml", label: "Malayalam" },
  { value: "bn", label: "Bengali" }, { value: "kn", label: "Kannada" }, { value: "gu", label: "Gujarati" },
  { value: "ur", label: "Urdu" },
  { value: "ar", label: "Arabic" }, { value: "bg", label: "Bulgarian" }, { value: "zh", label: "Chinese" },
  { value: "hr", label: "Croatian" }, { value: "cs", label: "Czech" }, { value: "da", label: "Danish" },
  { value: "nl", label: "Dutch" }, { value: "fil", label: "Filipino" }, { value: "fi", label: "Finnish" },
  { value: "fr", label: "French" }, { value: "de", label: "German" }, { value: "el", label: "Greek" },
  { value: "hu", label: "Hungarian" }, { value: "id", label: "Indonesian" }, { value: "it", label: "Italian" },
  { value: "ja", label: "Japanese" }, { value: "ko", label: "Korean" }, { value: "ms", label: "Malay" },
  { value: "no", label: "Norwegian" }, { value: "pl", label: "Polish" }, { value: "pt", label: "Portuguese" },
  { value: "ro", label: "Romanian" }, { value: "ru", label: "Russian" }, { value: "sk", label: "Slovak" },
  { value: "es", label: "Spanish" }, { value: "sv", label: "Swedish" }, { value: "tr", label: "Turkish" },
  { value: "uk", label: "Ukrainian" }, { value: "vi", label: "Vietnamese" },
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
