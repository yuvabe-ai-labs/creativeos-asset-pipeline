// Pure edit-request construction. NO "server-only" import — also imported by the
// client focus view to render the composed-prompt preview (spec §6 / D3).

export type EditIntent = "remove" | "replace" | "add" | "freeform";

// The preservation behavior is carried entirely by prompt phrasing (Gemini image-editing
// guide). Each intent has a DISTINCT template so the three quick-action chips never produce
// the same prompt; when intent is absent we fall back by whether a product reference is
// connected (add vs freeform). The result is the editable starting point shown in the UI.
export function buildEditPrompt(input: {
  instruction: string;
  intent?: EditIntent;
  hasExtraReference?: boolean;
}): string {
  const instruction = input.instruction.trim();
  const intent = input.intent ?? (input.hasExtraReference ? "add" : "freeform");

  switch (intent) {
    case "remove":
      return (
        `Using the provided image, remove ${instruction}. Keep everything else exactly the ` +
        `same — preserve the original subject, style, lighting, composition, and all remaining ` +
        `elements, and fill the vacated area so the edit is seamless.`
      );
    case "replace":
      return (
        `Using the provided image as the base scene, replace ${instruction} with the product ` +
        `shown in the additional reference image(s). Match the original placement, scale, ` +
        `perspective, lighting, and shadows. Keep everything else in the scene exactly the same.`
      );
    case "add":
      return (
        `Using the provided image as the base scene, add ${instruction} using the product shown ` +
        `in the additional reference image(s). Integrate it naturally with realistic scale, ` +
        `perspective, lighting, and shadows, and keep everything else in the scene exactly the same.`
      );
    case "freeform":
    default:
      return (
        `Using the provided image, change only ${instruction}. Keep everything else exactly the ` +
        `same — preserve the original style, lighting, composition, and all other elements.`
      );
  }
}

// Ordered reference list for an edit: base image first (Gemini treats the first image as the
// scene to preserve), then the other connected references, deduped and clamped (spec §7).
export function assembleEditReferences(input: {
  baseImageUrl: string;
  extraUrls: string[];
  max: number;
}): string[] {
  const extras = input.extraUrls.filter((u) => u !== input.baseImageUrl);
  return [input.baseImageUrl, ...extras].slice(0, Math.max(1, input.max));
}
