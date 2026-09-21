/**
 * A suppression list as a plain sentence, for models with no negative-prompt field.
 *
 * Veo 3.1 Lite rejects `negativePrompt` outright (D183) and Gemini Omni has no such field at all
 * (D208), so both state their negatives in the prompt text. Returns "" when there is nothing to
 * suppress, so a cleared field never leaves a dangling "Avoid:" on the request.
 */
export function avoidClause(negativePrompt: string): string {
  const avoid = negativePrompt.trim().replace(/[.\s]+$/, "");
  return avoid ? `Avoid: ${avoid}.` : "";
}
