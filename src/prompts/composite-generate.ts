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

// v3 (D320): a wired Script / Shot / Multishot node adds a "Shot context" block.
// v4: the context serves the description — a background asked for gets the shot's place, no person.
export const COMPOSITE_PROMPT_ID = "composite-generate-v4";
export const COMPOSITE_EDIT_PROMPT_ID = "composite-edit-v1";

// D320 — how the image model reads a wired script or shot. The DESCRIPTION decides what the
// picture is; the shot only fills in what the description asks for. v3 said "take who is in frame"
// unconditionally, and "a background for @Shot 1" came back with the shot's presenter standing in
// it. A still is one frozen frame, so motion becomes a moment; and the script's words must never
// be lettered into the picture, which an image model does readily when it sees quoted copy.
const CONTEXT_HEADER = [
  "Shot context: the moment of the video this picture is made for. The description below decides WHAT the picture is; use this only to fill in what the description asks for.",
  "- If the description asks for a background, location, setting, set or empty scene, take only the place from the shot: the space, its surfaces, furniture, props, colours and light. Put NO person, hands or body in it, even though the shot has one, and leave clear room where the subject will stand.",
  "- If the description asks for a person, product or the full moment, take who is in frame, what they hold and do, and the framing from the shot.",
  "- It is a single frozen frame: show a moment, not motion.",
  "- Never write any of its words (dialogue, voiceover, captions, on-screen text) into the picture.",
].join("\n");

function contextSection(context: string[] | undefined): string[] {
  return context && context.length ? [CONTEXT_HEADER, ...context, ""] : [];
}

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

export function buildCompositePrompt(args: {
  refs: CompositeRef[];
  instruction: string;
  /** D320 — compositeContextLines(); omitted or empty when no script or shot is wired. */
  context?: string[];
}): string {
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
    ...contextSection(args.context),
    "Make this picture:",
    args.instruction.trim(),
    "",
    "Rules:",
    ...rules.map((r) => `- ${r}`),
  ].join("\n");
}

/**
 * D312 — Edit, the part the operator sees and may edit: Image Gen's per-intent template on the
 * composite's current picture (image 1), then the ticked or mentioned references by position.
 * `instruction` is already resolved to "Name (image N)". No rules — those are appended on the
 * server (withCompositeEditRules), so hand-editing this text can never drop them.
 */
export function buildCompositeEditBrief(args: {
  instruction: string;
  intent: EditIntent;
  extras: CompositeRef[];
  /** A painted region travels with the request (models that take a mask): confine the change. */
  masked?: boolean;
}): string {
  const template = buildEditPrompt({
    instruction: args.instruction,
    intent: args.intent,
    hasExtraReference: args.extras.length > 0,
    masked: args.masked,
  });
  const roster = ["Image 1 is the picture being edited.", ...args.extras.map((r) => `Image ${r.position}: ${r.name}.`)];
  return [template, "", ...roster].join("\n");
}

/** The composite's preservation rules after an edit brief, so an edit cannot drift the face or
 *  invent branding. Never shown to the operator. */
export function withCompositeEditRules(brief: string, hasAvatar: boolean): string {
  const rules = [...(hasAvatar ? [PERSON_RULE] : []), PRODUCT_RULE, SEAMLESS_RULE];
  return [brief.trim(), "", "Rules:", ...rules.map((r) => `- ${r}`)].join("\n");
}

/** The whole edit prompt the image model receives: the brief, then the rules. */
export function buildCompositeEditPrompt(args: {
  instruction: string;
  intent: EditIntent;
  extras: CompositeRef[];
  hasAvatar: boolean;
  masked?: boolean;
}): string {
  return withCompositeEditRules(buildCompositeEditBrief(args), args.hasAvatar);
}
