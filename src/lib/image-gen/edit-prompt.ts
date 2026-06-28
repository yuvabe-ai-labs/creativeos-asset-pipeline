// Pure edit-request construction. NO "server-only" import — also imported by the
// client focus view to render the composed-prompt preview (spec §6 / D3).

export type EditIntent = "remove" | "replace" | "add" | "freeform";

// The preservation behavior is carried entirely by prompt phrasing (Gemini image-editing
// guide). `intent` picks the template; `hasExtraReference` is the fallback when intent is
// absent. The scaffolding is deterministic so it stays a stable eval variable (spec §6).
export function buildEditPrompt(input: {
  instruction: string;
  intent?: EditIntent;
  hasExtraReference?: boolean;
}): string {
  const instruction = input.instruction.trim();
  const useReferenceTemplate =
    input.intent === "replace" || input.intent === "add"
      ? true
      : input.intent === "remove" || input.intent === "freeform"
        ? false
        : Boolean(input.hasExtraReference);

  if (useReferenceTemplate) {
    return (
      `Using the first image as the base scene, ${instruction} using the product shown in ` +
      `the additional reference image(s). Match the scene's lighting, perspective, and shadows. ` +
      `Keep everything else in the base image unchanged.`
    );
  }
  return (
    `Using the provided image, change only ${instruction}. Keep everything else exactly the ` +
    `same — preserve the original style, lighting, composition, and all other elements.`
  );
}
