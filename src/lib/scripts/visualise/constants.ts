import { AVATAR_DEFAULT_SHEET_MODEL_ID } from "@/lib/avatars/constants";

// D345 — every panel is drawn by Nano Banana 2, the Studio's default sheet model and the one
// the dry run used (parent spec §11.1). No picker: one model, named once.
export const PANEL_MODEL_ID = AVATAR_DEFAULT_SHEET_MODEL_ID;

/** The script's aspect when the model takes it; every Jackfruit365 reel is 9:16. */
export const PANEL_ASPECTS = ["9:16", "16:9", "1:1", "4:3", "3:4"] as const;
export const PANEL_DEFAULT_ASPECT = "9:16";

/** D344 — the longest prompt the prompt box accepts. */
export const PANEL_PROMPT_MAX = 8000;

/** Longer than a draw can run (the route's maxDuration is 300 s). A take still "running" past
 *  this lost its request (a closed tab, a killed function) and is shown as failed. */
export const PANEL_RUNNING_TIMEOUT_MS = 10 * 60 * 1000;
export const PANEL_TIMED_OUT = "The panel did not finish. Generate it again.";

/** D345 — Generate all draws this many panels at once from the browser. */
export const GENERATE_ALL_CONCURRENCY = 3;
