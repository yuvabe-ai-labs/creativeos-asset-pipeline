// See docs/superpowers/specs/2026-07-24-credit-system-design.md §5.
//
// Approximate by design — no vendor can predict an LLM's unwritten output length before it
// generates. Unlike image/video (real vendor $ prices, converted via usdToFinalCredits),
// this heuristic is already credit-denominated with no underlying USD figure to convert —
// it deliberately bypasses usdToFinalCredits. Starting placeholder, no real usage data yet;
// self-corrects over time by refitting against real generations.credits_charged history.
export const PROMPT_ESTIMATE_BASE_CREDITS = 10;
export const PROMPT_ESTIMATE_PER_ATTACHMENT_CREDITS = 5;

export function estimatePromptCredits(attachmentCount: number): number {
  return PROMPT_ESTIMATE_BASE_CREDITS + PROMPT_ESTIMATE_PER_ATTACHMENT_CREDITS * attachmentCount;
}
