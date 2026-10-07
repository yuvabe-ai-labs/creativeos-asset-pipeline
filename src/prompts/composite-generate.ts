import type { CompositeRef } from "@/lib/composite/references";
import { buildEditPrompt, type EditIntent } from "@/lib/image-gen/edit-prompt";

// D312 — what the image model receives for a Composite node: the roster of attached images, the
// operator's instruction (chips already resolved to "Name (image N)"), and a fixed rule block.
//
// The rules add no lens effects, lighting setups or colour treatment of their own — a lighting
// recipe the operator never asked for is noise the video writer is told to discard (D281). They DO
// say how a person is put into a scene, and how to frame when the operator names no camera: the
// 2026-10-06 kitchen composite pasted the avatar in at portrait scale, studio-lit, in front of the
// room — and a composite is a UGC clip's reference, so the video model must be able to read the
// person and the room. The operator's camera words always win. Preservation runs both ways: a 2026-09-24 probe had Seedance invent lettering on a shoe
// specified "no text, no logo", so a prompt silent on it puts hallucinated branding on the
// client's product.

export const COMPOSITE_PROMPT_ID = "composite-generate-v2";
export const COMPOSITE_EDIT_PROMPT_ID = "composite-edit-v1";

const PERSON_RULE =
  "The person from the avatar images stays exactly who they are: the same face, features, skin tone, hair and build. Vary only their pose, angle, expression and framing. Keep their clothing unless the description changes it.";

// How a person goes INTO a scene. Only with an avatar wired.
const PLACEMENT_RULES = [
  "Place the person at realistic scale for the space: their feet, body and hands rest on real surfaces (floor, chair, counter) at the camera's eye level and perspective, never larger or closer than the room allows.",
  "The person is lit by the scene's own light, with the same direction, warmth and softness as the room, and matching shadows, including contact shadows where they touch the floor, counter or chair.",
  "They stand, sit or move inside the space, not posed in front of it: a natural pose that uses the room, never the portrait's crop or studio framing from the avatar images.",
];

// The composite is a UGC clip's reference. Unless told otherwise, frame it so the video model can
// read it.
const FRAMING_WITH_PERSON =
  "Unless the description sets the camera or framing, frame it like a still from an eye-level phone video: the person facing the camera, face and hands clearly visible, the room readable around them. If the description sets them, the description's camera and framing win.";
const FRAMING_WITHOUT_PERSON =
  "Unless the description sets the camera or framing, frame it like an eye-level phone photo with the space clearly readable. If the description sets them, the description's camera and framing win.";

const PRODUCT_RULE =
  "Any product or object taken from a reference image is reproduced exactly: the same shape, proportions, colours, materials, lettering and logo. Add no text, logo, label or branding that is not on it in the reference.";
const SEAMLESS_RULE =
  "Anything placed into the scene matches the rest of the photograph in sharpness and image quality: no cut-out edges, halo or pasted-on look.";

const COMMON_RULES = [
  PRODUCT_RULE,
  "Everything combined reads as one real photograph: one light, one perspective, consistent shadows and scale.",
  "The setting is what the description or a reference image shows. Add nothing to the scene that neither states.",
  "If the description asks for several panels or angles, every panel shows the same place, in the same light, at the same time of day.",
  SEAMLESS_RULE,
  "Add no lens effects, lighting setups or colour treatment the description does not ask for.",
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
  const rules = hasAvatar
    ? [PERSON_RULE, ...PLACEMENT_RULES, ...COMMON_RULES, FRAMING_WITH_PERSON]
    : [...COMMON_RULES, FRAMING_WITHOUT_PERSON];
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

/**
 * D312 — Edit: Image Gen's per-intent template on the composite's current picture (image 1),
 * the ticked or mentioned references after it, and the composite's preservation rules so an edit
 * cannot drift the face or invent branding. `instruction` is already resolved to "Name (image N)".
 */
export function buildCompositeEditPrompt(args: {
  instruction: string;
  intent: EditIntent;
  extras: CompositeRef[];
  hasAvatar: boolean;
}): string {
  const template = buildEditPrompt({
    instruction: args.instruction,
    intent: args.intent,
    hasExtraReference: args.extras.length > 0,
  });
  const roster = ["Image 1 is the picture being edited.", ...args.extras.map((r) => `Image ${r.position}: ${r.name}.`)];
  const rules = [...(args.hasAvatar ? [PERSON_RULE] : []), PRODUCT_RULE, SEAMLESS_RULE];
  return [template, "", ...roster, "", "Rules:", ...rules.map((r) => `- ${r}`)].join("\n");
}

