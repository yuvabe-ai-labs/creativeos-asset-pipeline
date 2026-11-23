// D545 — ids of models whose behaviour is written in code (multishot ladders, prompt templates,
// voice preview engines, edit models). The models' data lives in the catalog; only these names
// stay here. Client-safe.
/** Gemini Omni 1.1 — still selectable, being retired (D484). Saved nodes keep this id. */
export const GEMINI_OMNI_11_MODEL_ID = "gemini:gemini-omni-1.1-flash";
/** Gemini Omni 1.2 — 3–15s, the current Omni (D484). */
export const GEMINI_OMNI_12_MODEL_ID = "gemini:gemini-omni-1.2-flash";
/**
 * Google's model that cuts between shots natively — see MULTISHOT_MODELS (D235). Always the
 * CURRENT Omni version: multishot, edits and voice previews use it (D484).
 */
export const GEMINI_OMNI_MODEL_ID = GEMINI_OMNI_12_MODEL_ID;
/** Kling's flagship omni endpoint — the second model that cuts between shots natively (D235). */
export const KLING_OMNI_MODEL_ID = "kling:kling-3-0-omni";
/** Seedance 2.5 — its prompt template and voice samples are written for it. */
export const SEEDANCE_MODEL_ID = "seedance:seedance-2-5";
