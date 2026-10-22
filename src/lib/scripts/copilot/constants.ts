// Script copilot spec 2 (Generate).

/** The model that writes and edits scripts (spec 2 §11), recorded as D336. Chosen 8 Oct 2026 by the
 *  Reel 04 probe: the only candidate to pass every check on both UGC and Founder-led, and across
 *  repeats; slower than gpt-5.4-mini (35-85 s per first draft). */
export const SCRIPT_WRITER_MODEL = "gemini-3.1-pro-preview";

/** The quick model for the short steps that hold no house-spec writing: reading the person's
 *  message, proposing angles, building the confirmation card. Timed 8 Oct 2026 on Jackfruit 365:
 *  2.7 s / 5.8 s / 3.4 s against 10.6 s / 19.5 s / 17.7 s on the writer (D336, refined). */
export const SCRIPT_QUICK_MODEL = "gpt-5.4-mini";

/** The probe's candidates: "two or three candidate models" (spec 2 §11). Each is already called
 *  elsewhere in this repo, so its id and key are known to work. */
export const SCRIPT_WRITER_CANDIDATES = ["gpt-5.4-mini", "gemini-3.1-pro-preview", "gemini-3.8-flash"] as const;

/** What the first draft's review beat holds in place of a review (spec 2 §7; the outlines' own text). */
export const REVIEW_PLACEHOLDER = "[real review, verbatim]";

export const MAX_MESSAGE_CHARS = 4000;
/** A whole pasted script must fit in one message (paste-a-script spec §5.1): Reel 07 with the
 *  disclaimer block is about 4,000 characters, and a client's Word script with notes runs longer.
 *  The turn sends a long message that is not a script back with MAX_MESSAGE_CHARS (import.ts). */
export const MAX_PASTE_CHARS = 30000;
export const MAX_SELECTION_CHARS = 2000;

/** The cast name guessed for a script with nobody named on screen (paste-a-script §4.3). */
export const NARRATOR = "Narrator";
/** How an import's reply begins. The avatar link chips (suggestions.ts) show only while it is the
 *  newest message, so they must read the same text import.ts writes. */
export const IMPORT_REPLY_PREFIX = "Imported ";
