import type { ValidationResult } from "./validate";

/**
 * Why an image Generate is unavailable, when that needs SAYING (Image Gen and Composite). States
 * the button already narrates get no entry: "Generating…" and the estimating spinner say
 * themselves, and a tooltip repeating them is noise.
 *
 * Whether the button is disabled is a SEPARATE question (see imageGenerateDisabled): deriving one
 * from the other once dropped the in-progress guard with its tooltip, leaving "Generating…"
 * clickable, and every extra click charged for another image.
 */
export function imageGenerateBlocker(input: {
  editing: boolean;
  editable: boolean;
  hasPrompt: boolean;
  refValidation: ValidationResult;
  missingInputReason?: string;
}): string | null {
  const { editing, editable, hasPrompt, refValidation } = input;
  if (editing) return "An edit is already running.";
  if (!editable) return "Another session is editing, so this canvas is read-only.";
  if (!hasPrompt) return input.missingInputReason ?? "Connect a Prompt node to generate.";
  if (!refValidation.ok) {
    return refValidation.violations.length === 1
      ? "A reference image doesn't meet this model's requirements. Try resizing it or switching to a different model."
      : `${refValidation.violations.length} reference images don't meet this model's requirements. Try resizing them or switching to a different model.`;
  }
  return null;
}

/** Disabled for any stated reason, and always while generating or estimating. */
export function imageGenerateDisabled(blocker: string | null, generating: boolean, estimating: boolean): boolean {
  return Boolean(blocker) || generating || estimating;
}
