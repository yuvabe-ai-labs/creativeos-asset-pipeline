import { imageGenClientModels } from "@/lib/image-gen/client-models";

// D346, amended in testing (8 Oct 2026, user): panels are drawn with GPT Image 2 by default, and
// the model can be changed under Advanced. Only OpenAI and Gemini models are offered: their
// providers fetch every reference themselves, so the inline house style image reaches them
// (Seedream hands URLs to the vendor).
export const PANEL_MODEL_ID = "openai:gpt-image-2";
export const PANEL_MODEL_IDS: readonly string[] = imageGenClientModels
  .filter((m) => m.provider === "openai" || m.provider === "gemini")
  .map((m) => m.id);
export function isPanelModel(modelId: string): boolean {
  return PANEL_MODEL_IDS.includes(modelId);
}

/** D339, amended in testing (8 Oct 2026, user): an avatar made in a cast card uses GPT Image 2 for
 *  its face and its views by default; Advanced changes it. (The Studio keeps its own defaults.) */
export const VISUALISE_AVATAR_MODEL_ID = "openai:gpt-image-2";

/** The script's aspect when the model takes it; every Jackfruit365 reel is 9:16. */
export const PANEL_ASPECTS = ["9:16", "16:9", "1:1", "4:3", "3:4"] as const;
export const PANEL_DEFAULT_ASPECT = "9:16";

/** D345 — the longest prompt the prompt box accepts. */
export const PANEL_PROMPT_MAX = 8000;

/** Longer than a draw can run (the route's maxDuration is 300 s). A take still "running" past
 *  this lost its request (a closed tab, a killed function) and is shown as failed. */
export const PANEL_RUNNING_TIMEOUT_MS = 10 * 60 * 1000;
export const PANEL_TIMED_OUT = "The panel did not finish. Generate it again.";

/** D346 — Generate all draws this many panels at once from the browser. */
export const GENERATE_ALL_CONCURRENCY = 3;
