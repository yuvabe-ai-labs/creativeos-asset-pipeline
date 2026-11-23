// D543 — the models the app starts new work on. A preference, not a rule: the lists use it only
// while the catalog has it live, and otherwise start on the first live model in sort order.
// Client-safe.
export const DEFAULT_IMAGE_MODEL_ID = "gemini:gemini-3-pro-image";
export const DEFAULT_VIDEO_MODEL_ID = "gemini:gemini-omni-1.2-flash";
