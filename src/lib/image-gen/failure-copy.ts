// D366 — the plain words a user sees when an image generation fails (toast, node status, History).
// The raw reason (a vendor message, a missing key, a webhook status naming the paid image) stays in
// server logs only. No `server-only`: the canvas feed (node-status.ts) reads the start messages.

export const IMAGE_GENERATION_FAILED_MESSAGE = "The generation failed. Please try again.";
export const IMAGE_PROMPT_DECLINED_MESSAGE = "The model declined this prompt. Try rewording it.";
/** The provider account behind the model is out of spend or quota: retrying won't help until an admin tops it up. */
export const IMAGE_MODEL_UNAVAILABLE_MESSAGE =
  "This model's spending limit has been reached. An admin needs to raise the limit or add billing for it. Until then, try another model.";
/** The provider is only rate-limiting: a retry shortly after should work. */
export const IMAGE_MODEL_BUSY_MESSAGE = "This model is busy right now. Please try again in a minute.";

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

// The account is out of money or quota: Gemini's "spending cap", OpenAI's "exceeded your current
// quota" / insufficient_quota, BytePlus's overdue-balance codes. Checked before the busy pattern,
// since both arrive as a 429.
const UNAVAILABLE_PATTERN = /spend(ing)?[\s_-]?cap|exceeded your current quota|insufficient[\s_-]?quota|billing[\s_-]?hard[\s_-]?limit|overdue|insufficient[\s_-]?balance/i;
// Plain rate limiting: a 429 or RESOURCE_EXHAUSTED with nothing above.
const BUSY_PATTERN = /rate[\s_-]?limit|too many requests|resource[\s_-]?exhausted|\b429\b/i;

/** The plain message to store for a failed image run, whatever the task reported. */
export function plainImageFailure(raw: string): string {
  if (DECLINED_PATTERN.test(raw)) return IMAGE_PROMPT_DECLINED_MESSAGE;
  if (UNAVAILABLE_PATTERN.test(raw)) return IMAGE_MODEL_UNAVAILABLE_MESSAGE;
  if (BUSY_PATTERN.test(raw)) return IMAGE_MODEL_BUSY_MESSAGE;
  return IMAGE_GENERATION_FAILED_MESSAGE;
}
