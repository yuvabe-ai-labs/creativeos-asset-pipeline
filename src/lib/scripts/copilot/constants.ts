// Script copilot spec 2 (Generate).

/** The model that writes and edits scripts (spec 2 §11). Chosen by the probe in Task 5 and recorded
 *  as D335; until then the Script node parse's model, which this repo already calls. */
export const SCRIPT_WRITER_MODEL = "gpt-5.4-mini";

/** The probe's candidates: "two or three candidate models" (spec 2 §11). Each is already called
 *  elsewhere in this repo, so its id and key are known to work. */
export const SCRIPT_WRITER_CANDIDATES = ["gpt-5.4-mini", "gemini-3.1-pro-preview", "gemini-3.8-flash"] as const;

/** What the first draft's review beat holds in place of a review (spec 2 §7; the outlines' own text). */
export const REVIEW_PLACEHOLDER = "[real review, verbatim]";

export const MAX_MESSAGE_CHARS = 4000;
export const MAX_SELECTION_CHARS = 2000;
