// Script copilot spec 2 (Generate).

/** The model that writes and edits scripts (spec 2 §11), recorded as D335. Chosen 8 Oct 2026 by the
 *  Reel 04 probe: the only candidate to pass every check on both UGC and Founder-led, and across
 *  repeats; slower than gpt-5.4-mini (35-85 s per first draft). */
export const SCRIPT_WRITER_MODEL = "gemini-3.1-pro-preview";

/** The probe's candidates: "two or three candidate models" (spec 2 §11). Each is already called
 *  elsewhere in this repo, so its id and key are known to work. */
export const SCRIPT_WRITER_CANDIDATES = ["gpt-5.4-mini", "gemini-3.1-pro-preview", "gemini-3.8-flash"] as const;

/** What the first draft's review beat holds in place of a review (spec 2 §7; the outlines' own text). */
export const REVIEW_PLACEHOLDER = "[real review, verbatim]";

export const MAX_MESSAGE_CHARS = 4000;
export const MAX_SELECTION_CHARS = 2000;
