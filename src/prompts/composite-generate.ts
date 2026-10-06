import type { CompositeRef } from "@/lib/composite/references";

// D309 — what the image model receives for a Composite node: the roster of attached images, the
// operator's instruction (chips already resolved to "Name (image N)"), and a fixed rule block.
//
// The rules hold only what is always true. They add NO styling: camera, lens, lighting and colour
// come from the operator's words or not at all — a location sheet's light is its content, but a
// lighting recipe the operator never asked for is noise the video writer is told to discard
// (D281). Preservation runs both ways: a 2026-09-24 probe had Seedance invent lettering on a shoe
// specified "no text, no logo", so a prompt silent on it puts hallucinated branding on the
// client's product.

export const COMPOSITE_PROMPT_ID = "composite-generate-v1";

const PERSON_RULE =
  "The person from the avatar images stays exactly who they are: the same face, features, skin tone, hair and build. Vary only their pose, angle, expression and framing. Keep their clothing unless the description changes it.";

const COMMON_RULES = [
  "Any product or object taken from a reference image is reproduced exactly: the same shape, proportions, colours, materials, lettering and logo. Add no text, logo, label or branding that is not on it in the reference.",
  "Everything combined reads as one real photograph: one light, one perspective, consistent shadows and scale.",
  "The setting is what the description or a reference image shows. Add nothing to the scene that neither states.",
  "If the description asks for several panels or angles, every panel shows the same place, in the same light, at the same time of day.",
  "Use only the camera, lighting and colour treatment the description asks for.",
];

// The sheet's wording follows D308's presenter rows: identity only, because a multi-view sheet on
// a plain backdrop has been read as a location before (D281).
function rosterLine(ref: CompositeRef): string {
  const where = `Image ${ref.position}`;
  if (ref.role === "avatar") {
    return `- ${where}: ${ref.name}, the person in this picture (a front view). Take only their face, hair, build and clothing, never this image's background, lighting or framing.`;
  }
  if (ref.role === "avatar-sheet") {
    const person = ref.name.replace(/ sheet$/, "");
    return `- ${where}: ${person}'s profile sheet: front, side and back views of the same person, for their build and outfit. Never its plain background, lighting or layout.`;
  }
  return `- ${where}: ${ref.name}.`;
}

export function buildCompositePrompt(args: { refs: CompositeRef[]; instruction: string }): string {
  const hasAvatar = args.refs.some((r) => r.role === "avatar");
  const roster = args.refs.length
    ? ["Reference images, in the order attached:", ...args.refs.map(rosterLine)]
    : ["No reference images are attached; make the whole picture from the description."];
  const rules = [...(hasAvatar ? [PERSON_RULE] : []), ...COMMON_RULES];
  return [
    ...roster,
    "",
    "Make this picture:",
    args.instruction.trim(),
    "",
    "Rules:",
    ...rules.map((r) => `- ${r}`),
  ].join("\n");
}
