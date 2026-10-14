// D366 — the plain words a user sees when an image generation fails (toast, node status, History).
// The raw reason (a vendor message, a missing key, a webhook status naming the paid image) stays in
// server logs only. No `server-only`: the canvas feed (node-status.ts) reads the start messages.

export const IMAGE_GENERATION_FAILED_MESSAGE = "The generation failed. Please try again.";
export const IMAGE_PROMPT_DECLINED_MESSAGE = "The model declined this prompt. Try rewording it.";

/** A start that failed inside the request. The request's own toast says it, so the feed doesn't. */
export const START_FAILED_MESSAGE = "Couldn't start the generation. Please try again.";
export const CREDIT_LIMIT_MESSAGE = "Monthly credit limit reached";

const START_FAILURE_MESSAGES: ReadonlySet<string> = new Set([START_FAILED_MESSAGE, CREDIT_LIMIT_MESSAGE]);

/** Whether a failed image row's error is one its start request already reported. */
export function isImageStartFailure(error: string | null | undefined): boolean {
  return typeof error === "string" && START_FAILURE_MESSAGES.has(error);
}

// The providers' refusal wording: OpenAI's "safety system" / moderation_blocked, Seedream's
// *SensitiveContentDetected codes, a "content policy" mention anywhere.
const DECLINED_PATTERN = /moderation|safety|sensitive|content[\s_-]?policy/i;

/** The plain message to store for a failed image run, whatever the task reported. */
export function plainImageFailure(raw: string): string {
  return DECLINED_PATTERN.test(raw) ? IMAGE_PROMPT_DECLINED_MESSAGE : IMAGE_GENERATION_FAILED_MESSAGE;
}
