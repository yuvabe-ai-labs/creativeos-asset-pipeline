// D231 — the Multishot Prompt node's writer, and Omni's own system prompt.
//
// D236/D238: this is now the CANONICAL file in a small DAG — it imports neither
// multishot-prompt-kling.ts nor multishot-prompt-for.ts, so importing this file can never form a
// cycle. It exports the blocks the Kling prompt shares (MULTISHOT_SHARED_CRAFT,
// referenceIdentificationBlock, MULTISHOT_PLAN_SCHEMA) verbatim; the per-model routing itself
// lives in multishot-prompt-for.ts, the only file that imports both writers.
import {
  MOTION_AVOID_LIST,
  MULTISHOT_AUTHORING_MODEL,
  SUBJECT_SILENT_CAMERA,
  VO_PERFORMANCE_RULES,
} from "@/prompts/video-prompt-generate";
import type { RefineScope } from "@/lib/nodes/refine-suggestions";
import { REF_ROLES } from "@/lib/nodes/ref-roles";

/** Bumped whenever the system text or schema changes; recorded on every version row. */
// @5 (D262): the look is transcribed from stated direction or left empty; no assumed setting.
// @6 (D263): motion trimmed to one plain action, a simple camera and a grounding line.
// @7: the voiceover is WRITTEN into the beats, verbatim, on every model (MULTISHOT_SHARED_CRAFT).
// @8: `cutId` is enum-constrained to the node's own ids (planSchemaForCuts). System text unchanged;
//     bumped because the SCHEMA changed, per this constant's own rule.
// @9 (D267, Task 5): the writer no longer writes the spoken words — `voiceoverRules` is replaced by
//     the shared VO_PERFORMANCE_RULES, which tells it a line is coming (on-screen/off-screen) and
//     forbids writing it; renderPlan appends the actual line afterwards.
// @10 (D281): references are identity-only unless the operator's direction says otherwise; images
//     arrive labelled "Reference image N" and the direction may cite them by that number.
// @11 (D319): every reference gets a role (stated by the direction, or inferred from the image) and
//     background / storyboard / character / product roles are written out in full; the schema
//     gains a scratch `references` reading filled before the look and beats.
// @12 (D441–D444): a product is named and pinned to its picture, never described; the writer no
//     longer writes a look (the operator's "Rules for every shot" arrive as input instead); the
//     reading gains a role enum and a short name, kept on the plan as `refRoles`; a character
//     appears only in shots that involve a person.
// @13 (D453): the storyboard decides what each beat shows, whatever the number of shots; a worn
//     product replaces the person's own item of that kind and is in every beat its wearer is in.
// @14 (D455): the operator's direction is an order that outranks the shot text, the storyboard and
//     the references, and is followed only by writing it into the beats, never by leaving out.
// @15 (D457): graphics (review cards, claim cards, subtitles…) are added after generation, so a beat
//     never shows one or holds space for it; the action leads each beat with at most two props; a
//     background contributes its place, not the loose things lying in it.
// @16 (D458): props keep their names and an unlabelled prop stays plain; the camera is set shot by
//     shot (a camera note in the production notes is for its own shot), steady unless asked.
export const MULTISHOT_PROMPT_ID = "multishot-prompt-generate@16";

/**
 * How to READ an attached reference image and name what it shows — without binding it to a beat.
 *
 * Per D233 the writer never assigns reference tokens itself, on EITHER model; the operator
 * attaches a reference by `@`-mentioning it in the beat afterwards. That is why this block is
 * shared rather than per-model: the binding rule is ours, not the vendor's. Only the worked
 * example differs, because showing Omni's timecode ladder inside a Kling prompt would model the
 * one output shape that prompt forbids.
 *
 * `refsCitedIn` (src/lib/nodes/multishot-plan.ts) still scans beats for a token shape, but what it
 * now finds is the operator's own citations rather than the model's guesses. This is the only
 * consumer of this block — it does not belong in video-prompt-generate.ts, which never references
 * it itself (its Omni counterpart was deleted).
 */
export function referenceIdentificationBlock(format: "timecode" | "triple"): string {
  // D263 — one plain action each, no secondary motion and no unstated light: the example is what
  // the writer imitates, so it has to model the simple beat the craft block asks for.
  const example =
    format === "triple"
      ? `    A college student crosses a campus courtyard carrying the mug, exactly as in its reference.
    A young professional steps past a cafe chair with the backpack, exactly as in its reference.`
      : `    [0-3s] A college student crosses a campus courtyard carrying the mug, exactly as in its reference.
    [3-6s] A young professional steps past a cafe chair with the backpack, exactly as in its reference.`;

  return `REFERENCES
The reference images are ATTACHED to your message, each preceded by "Reference image N". LOOK AT THEM and identify what each one shows. The number exists only so the operator's direction can point at a picture; what a reference is, you decide from the image itself.

EVERY REFERENCE HAS A ROLE — DECIDE IT, THEN HONOUR IT IN FULL. The operator's direction (and any per-shot instruction) may say what a reference is for — "use reference image 2 as the background", "follow the storyboard in reference image 3", "reference image 1 is the character". When it does, that is the role. When it does NOT, infer the role from the image itself — the operator attached it for a reason, and silently ignoring it is the failure to avoid:
- A place with no main subject — a room, a street, a landscape, an interior, a set — is a BACKGROUND.
- A grid or strip of panels, sketches or numbered frames is a STORYBOARD.
- A person, alone or shown from several angles, is a CHARACTER.
- An object or packshot is a PRODUCT; a logo or wordmark is a BRAND MARK (see below).
- An image whose subject is irrelevant but whose colour, light or grade is striking, with nothing else to take from it, is a STYLE reference.
A direction that states a role always wins over what you infer.

A CHARACTER OR PRODUCT REFERENCE CARRIES IDENTITY, NOT ITS BACKDROP. From it, carry who or what it shows — face, build, hair, wardrobe, the product's design. Never carry its background, backdrop, studio lighting, the colour of a seamless, its camera angle or its framing into any beat. A sheet showing one subject from several angles on a plain background is an identity sheet, never a location. Only a reference whose role is background or storyboard contributes a place or a composition.

What you write depends on the role. A PRODUCT is carried by its picture: you name it and never describe it. A place, a storyboard or a person needs words, because for those the video model reproduces only the elements the prompt NAMES: anything you leave unwritten is usually dropped or replaced. Study each image and write what its role asks:

- BACKGROUND / LOCATION / SETTING / ENVIRONMENT — the subject is placed IN that place. Read it closely in your reference notes: the kind of space, its surfaces and its fixed furniture. In every beat set there, name the place and at most two of its elements, the ones the action uses or stands beside ("at the marble counter, the arched window behind her"). Loose things lying in the picture (food, dishes, devices, bags) are not this shot's props unless its shot text calls for them. Do not write its light, palette or grade into the beats; the picture carries them. Do not swap in a different place or simplify it to a generic one.
- STORYBOARD / SHOT REFERENCE / COMPOSITION — read the panels in order (left to right, top to bottom unless they are numbered) and map them to the shots in order, unless the direction maps them differently. For each shot, carry what its panel shows: shot size, camera angle and height, where the subject sits in frame, what they are doing, and any arrow or note indicating a camera move or action. Never carry the drawing style — sketch lines, greyscale, panel borders, handwritten notes — into any beat; a storyboard is a plan for the shot, not its appearance. Its packs and labels are drawn blank on purpose: never let a panel describe the product.
- CHARACTER / PERSON / AVATAR — describe the person so they read as the same individual in every beat they appear in: apparent age and build, skin tone, hair (colour, length, style), facial hair or glasses, and EVERY visible wardrobe item with its colour and material (top, layers, bottoms, footwear), plus accessories (jewellery, watch, bag, headwear), as the direction leaves them: an item the direction removes or changes is written as directed, never as pictured. Repeat that description, not a shortened one, in every beat the character appears in, and only in the beats whose shot text involves a person.
- PRODUCT — name it by what it is, in a few words ("the tea pouch", "the sliders"), and say how many when there is more than one. Never describe its colour, material, shape, components, label text, lettering or logo: the reference carries all of that, and prose competing with it produces a hybrid of the two.
- STYLE / MOOD / LOOK — the picture carries its light and colour. Write nothing about it into the beats, and never take its subject or its location.

A reference may hold more than one role ("the character, in this kitchen"); apply each. When two references compete for the same role (two backgrounds, two storyboards) and the direction does not say which shot gets which, follow the shot texts; if they do not decide it either, use the first for the whole sequence.

DO NOT WRITE REFERENCE TOKENS. Never write <IMAGE_REF_0>, "the first image", "reference image 2", @Image1, or any other pointer into the attachment list. Which picture binds to which beat is the operator's decision, made by hand after reading your draft. A token you assign yourself binds a specific photograph silently, and a wrong binding raises no error — it is only visible in a clip already paid for.

Instead, NAME WHAT YOU SAW, in prose, wherever that thing appears in a beat:

${example}

For a product, a short identifying name is exactly right wherever it appears: "the tea pouch", "the ceramic mug". For a character in passing, a short phrase: "a young woman in a loose oatmeal shirt". It tells the operator which attachment you meant, so a misreading is caught in the text rather than in a finished video. Never go further into a product's design, colour, material, label or logo. Describe instead what the reference cannot: framing, motion, wardrobe, ground contact. A background, storyboard or central character is described as its role asks above, using as much of the beat as any length limit allows.

Name the thing IN EVERY BEAT it appears in, not once at the top.

NOT EVERY ATTACHMENT IS A THING THAT CAN APPEAR IN A SCENE. Decide which KIND each one is before naming it:

- A PRODUCT, PERSON, GARMENT or SURFACE — something physical that exists in the world of the shot. Name it wherever the shot puts it.
- A BRAND MARK — a logo, wordmark or lock-up, usually alone on a plain white background. This is a GRAPHIC, not an object. It is not footwear, it is not worn, it does not walk, and it cannot be set down on a surface. NEVER name it as a product and never let it stand in for one: a mark misread as a shoe is the single worst reference error, because the beat then asks the model to animate a logo as if it had feet.

  When a shot asks for the logo — "…followed by logo", "end on the brand mark" — write the shot the frame actually needs and stop there: the product arrangement and the final held framing, with no space held for the mark. The lock-up is composited in post, where the type is exact. Generated lettering is not, and this request carries a standing instruction against screen-space type anyway.

USE ONLY THE REFERENCES THIS SHOT CALLS FOR. The attachments are a library, not a checklist. Name a product where the shot's own content asks for it and leave the rest out — forcing an unrelated product into a beat in order to "use" it is worse than omitting it. The operator adds any others by hand. Backgrounds, storyboards and characters are the exception: a background applies to every shot it plausibly belongs in, a character to the shots whose text involves a person (or only the shots the direction names), and a storyboard's panels map onto the shots. A product-only shot shows nobody.`;
}

/** Omni's copy — byte-identical to what shipped before this became a function. */
export const REFERENCE_IDENTIFICATION_BLOCK = referenceIdentificationBlock("timecode");

/**
 * D442 — the operator's "Rules for every shot", and the end of the writer's look block.
 *
 * The writer wrote a look & atmosphere paragraph for every plan (D231), later only from stated
 * direction (D262). Its light, palette and grade words acted on the product as much as the set —
 * "the palette is yellow packaging against warm wood" re-lit a pouch the reference already showed —
 * and operators deleted it or used the field for rules. The field is now the operator's: the
 * writer reads it, obeys it, and never writes it. Shared verbatim by every writer.
 */
export const MULTISHOT_RULES_INPUT = `RULES FOR EVERY SHOT
The operator may give "Rules for every shot". They are added to the prompt above your beats
exactly as written. Obey them in every beat; never restate, quote or paraphrase them.

There is no look or atmosphere paragraph. Do not describe light, palette, grade or lens feel for
the sequence as a whole. A beat states light only when its shot text does.`;

/**
 * The beat contract: the operator's shot text is the brief the beat renders, not a suggestion to
 * improve on, and a shot text naming several camera setups still gets rendered as ONE beat. Also
 * ours rather than a vendor's, and also shared verbatim (D231/D238) for the same reason as the rules
 * block above.
 */
export const MULTISHOT_SHOT_TEXT_CONTRACT = `THE OPERATOR'S DIRECTION COMES FIRST
The operator's direction for the sequence, and any instruction for one shot, are orders. They
outrank everything else here: the shot text, the storyboard, the brand context and what any
reference shows. The video model never reads the direction. It reads only your beats and the
pictures, so a direction is followed only when your beats SAY it. Leaving something out is not
following it: the pictures put it straight back. Write each order into every beat it touches, in
plain positive words ("Maya should be barefoot" becomes "Maya, barefoot on the rug, ..." in each
beat she is in). When an order changes what a reference shows (an item of clothing, a prop, the
time of day), write the changed version in each of those beats, never the pictured original.

GRAPHICS ARE ADDED AFTER GENERATION. Review cards, claim cards, badges, subtitles, captions, price
tags, supers and every other on-screen graphic are put in by hand in the edit. When a shot text
mentions one, write the shot without it: never a card, screen, sign, sticker, box or panel standing
in for it, and no space held for it in the frame. A shot that is only a graphic ("hold on the claim
card over the pack") is written as the scene under it ("the pack on the counter, held steady").

THE ACTION COMES FIRST. Open each beat with who does what, then where. Name the place and at most
two props, the ones the action uses. A list of everything on the counter crowds the action out, and
the video model then drops the very moment the shot is for.

PROPS KEEP THEIR NAMES. A prop is written as the shot text, the script or the location names it.
Never swap it for another (an apple stays an apple), and never turn the product's name into an
ingredient or a prop: a product called "green tea pouch" puts no tea leaves on the counter. A prop
the script calls plain or unlabelled is written "plain, no label", so no brand appears on it.

THE CAMERA IS SET SHOT BY SHOT. The script's production notes describe the whole reel: take its
place, light and look from them, but a camera note there ("handheld, top-down on the bowl") belongs
only to the shot it describes, never to every shot. Each beat's camera comes from its own shot text,
its storyboard panel and the operator's direction. The camera is steady by default (locked off, or
one slow smooth move): write handheld only when the shot text or the direction asks for it.

THE SHOT TEXT IS THE BRIEF
The operator's shot text is what that shot IS. Your beat RENDERS it; it does not replace it. Do not
substitute a different subject, setting or action, and do not add people, props or places the shot
text does not call for — except what an attached background or storyboard reference brings with it
(the elements of the background, the content of the storyboard panels).

Do not add weather, season, time of day or location that the shot text, the script's production
notes and the operator's instructions do not state. The brand context tells you how the brand
speaks and what it may not claim. It is NOT a source of setting: a brand known for rain-ready
footwear does not make an unstated shot rainy.

A character reference applies only to shots whose text involves a person; a product-only shot
shows nobody.

A shot text often names more than one camera setup — "Rapid close-ups. A man picks up his keys. A
woman steps out of a cab. Someone grabs a coffee." A beat of a few seconds cannot hold four setups,
and trying is the single biggest reason a generation comes back as mush. Choose the ONE the shot
leads with, or the one its length can actually carry, and render that completely. The operator
splits the rest into their own shots when they want them.

A STORYBOARD IS THE APPROVED PICTURE OF THE CLIP. The client signed off on it, so the video must
show what it shows: the same moments, in the same order, with the same people in frame, the same
places, actions, shot sizes and framing. Read its frames in order and lay them across the beats by
time, whatever the number of either:
- As many frames as beats: each beat is its frame.
- More frames than beats: each beat carries the frames that fall in its share of the time, written
  as ONE continuous take that passes through them in order on one simple camera ("he finishes
  dressing, glances at his watch, runs a hand through his hair and bends to pick up the slippers").
  Every frame's moment appears; none is dropped for being short. This is the one exception to one
  action per beat, and it still keeps a single camera and plain motion.
- Fewer frames than beats: each frame sets the beats around it; the beats between two frames
  continue the earlier frame's moment.
When the shot text and the storyboard disagree, the storyboard wins: it is the later, approved
version, and the operator's direction still outranks both. Never describe the drawing itself (its lines, sketch style or colours): it is a plan,
and the other references are what things look like.

WORN PRODUCTS. When the product is something worn or carried (footwear, clothing, eyewear, a watch,
a bag), the person wears or carries the product in place of their own item of that kind: never
describe both, and never take that item from the person's reference. The product is in every beat
its wearer is in, named ("in the Brandname sliders"), even when the shot text only implies it.`;

/**
 * The craft rules that are OURS, not a vendor's: one action per beat, simple motion, camera,
 * grounding, preservation. They describe how generated motion fails, which is a property of
 * diffusion video and not of one vendor's API — so every writer gets them from here rather than
 * each carrying a paraphrase that drifts.
 *
 * D263 — deliberately SHORT on motion. This block used to carry a five-rule PHYSICS section (force
 * verbs, what takes the weight, how materials behave, heel-first gait), four editing-grammar rules
 * (30-degree angle changes, screen direction, movement carried across cuts) and a call for
 * "micro-detail" and "the timing of small movements". Each asked the writer to narrate one more
 * motion per beat, and every narrated motion is one more thing the video model tries to animate —
 * the operator reported the result as overcomplicated motion. What survives is what fixed the
 * original physics complaint: one action per beat, and subjects that stay grounded.
 *
 * What IS shared with Kling's prompt, verbatim, beyond this block: MULTISHOT_RULES_INPUT and
 * MULTISHOT_SHOT_TEXT_CONTRACT above, and referenceIdentificationBlock() below (with a per-model
 * format argument). What genuinely DIFFERS per model and stays in each file: the opening line, the
 * per-model character ceiling or lack of one, Kling's "NAMING THINGS THE REFERENCES CARRY" block,
 * and the "Do NOT write timecodes…" sentence (Kling's also forbids shot numbers).
 */
export const MULTISHOT_SHARED_CRAFT = `ONE DOMINANT ACTION PER BEAT
One subject, one plain action. Never a chain — "A, then B, then C" inside a few seconds produces
none of them cleanly: the model resolves competing actions by blending, and blending is what reads
as melting, sliding and morphing.

KEEP THE MOTION SIMPLE
Write the action the way the shot text puts it — "she walks to the door", "he lifts the sandals off
the shelf" — and stop there. Do not add secondary motions, micro-movements, physics narration or
choreography the shot text does not ask for. Every motion you describe is one more thing the video
model tries to animate; a beat with one clear motion comes back cleaner than a beat with five.

CAMERA
Use the framing and camera move the shot text gives. Where it gives none, choose a framing and keep
the camera static or on one slow, simple move. Vary shot size between neighbouring beats so each cut
reads as a cut.

${SUBJECT_SILENT_CAMERA}

GROUNDING
Every subject keeps contact with whatever it stands or rests on — nothing floats, hovers or slides.
Where it matters, say so in a few words ("feet on the floor"); do not describe weight, force or how
materials move.

BE SPECIFIC ABOUT WHO AND WHAT
Name people, clothing and objects specifically rather than generically ("a young woman" -> "a young
woman in a loose linen shirt"), but add no setting the shot text does not name. A referenced
product is the exception: name it, never describe it (see PRESERVATION).

Do not write on-screen text, captions, titles or signage copy into a beat. The request carries a
standing instruction against screen-space type, and asking for lettering here would contradict it.

PRESERVATION
A referenced product is carried by its picture, not by your words. Name it, then pin it to the
picture in a few words whenever it is on screen: "the pouch exactly as in its reference". Never
describe its colour, material, shape, label text, lettering or logo: prose about the product
competes with the picture and the model draws a hybrid.`;

const SYSTEM = `You write the shot-by-shot motion plan for a single multi-shot video generation.

You are given a sequence of SHOTS. Each has an id, the operator's shot text, and its length in
seconds. You return one written beat per shot.

${MULTISHOT_RULES_INPUT}

THE BEATS
Return exactly one beat per shot given, echoing that shot's \`cutId\` EXACTLY as provided. Never
invent an id, never merge two shots into one beat, never split one shot across two.

${MULTISHOT_SHOT_TEXT_CONTRACT}

${MULTISHOT_SHARED_CRAFT}

${VO_PERFORMANCE_RULES}

Do NOT write timecodes, durations or shot numbers into the text. The timings are the operator's
and are added afterwards; anything you write about time will contradict them.

${REFERENCE_IDENTIFICATION_BLOCK}

AVOID
${MOTION_AVOID_LIST}`;

/**
 * What every model's writer returns — the router (`multishotPromptFor`) hands back one of these.
 *
 * `schema` is `Record<string, unknown>` rather than the bare `object`: the OpenAI SDK's own
 * `json_schema.schema` field is typed with a string index signature, and TS does not consider the
 * built-in `object` type assignable to an index-signature type even though a literal schema object
 * (like `MULTISHOT_PLAN_SCHEMA`) structurally satisfies it.
 */
export type MultishotPromptSpec = {
  id: string;
  model: string;
  system: string;
  schema: Record<string, unknown>;
};

/**
 * D319 — the writer's reading of the attached references, filled BEFORE the beats.
 *
 * D443 — no longer scratch only: on a whole write the route keeps each entry's `role` and `name`
 * as the plan's `refRoles` (`refRolesFromReading`), and the video request labels each image with
 * them. `contents` stays scratch. It exists
 * because strict structured output generates properties in schema order — placing it first makes
 * the model inventory each picture (and the role the direction gives it) before it writes a single
 * beat, instead of glancing at a background or a storyboard and naming it in passing. An empty
 * array is the answer when nothing is attached.
 */
const REFERENCE_READING = {
  type: "array",
  description:
    "Fill this FIRST. One entry per attached reference image, in order. Not shown to anyone — it is your working notes for the beats that follow, and its role and name label each image for the video model.",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["image", "role", "name", "contents"],
    properties: {
      image: { type: "integer", description: "The N of \"Reference image N\"." },
      role: {
        type: "string",
        enum: [...REF_ROLES],
        description:
          "This image's main role: location is a background or set, person is a character. The direction or a shot instruction wins when it states one; otherwise read it from the image.",
      },
      name: {
        type: "string",
        description:
          "1 to 5 words: what the operator would call it (\"tea pouch\", \"podcast set\", \"Maya\").",
      },
      contents: {
        type: "string",
        description:
          "What the image actually shows, in the detail its role needs: for a location, the space, surfaces, props and their positions; for a storyboard, each panel in order with shot size, angle, subject placement and action; for a person, age, build, hair and every wardrobe item and accessory with colours; for a product, what it is in a few words; for a brand mark or style reference, brief.",
      },

    },
  },
} as const;

/**
 * The plan JSON shape — IDENTICAL across models (D238). Exported so Kling's writer imports it
 * rather than declaring its own copy: the merge path (`mergeRefinedPlan`) and `spec.schema` both
 * depend on this exact shape, and two copies of it is exactly the drift the reuse rule in
 * AGENTS.md exists to prevent. `SCHEMA` is kept as a local alias so the rest of this file (and
 * `multishotPromptGenerate`'s return) is untouched.
 */
export const MULTISHOT_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  // D442 — no `look`: the operator writes the rules; parsePlan reads an absent look as empty.
  required: ["references", "beats"],
  properties: {
    references: REFERENCE_READING,
    beats: {
      type: "array",
      description: "Exactly one entry per shot given, in the order the shots were given.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["cutId", "text"],
        properties: {
          cutId: {
            type: "string",
            description: "Echoed EXACTLY from the shot this beat is written for.",
          },
          text: {
            type: "string",
            description:
              "What happens in this shot: subject, action, framing and camera movement. No timecodes, no durations, no shot numbers.",
          },
        },
      },
    },
  },
} as const;
const SCHEMA = MULTISHOT_PLAN_SCHEMA;

/**
 * The plan schema for ONE request, with `cutId` constrained by `enum` to the node's actual cut ids.
 *
 * THIS IS WHY IT EXISTS. Cut ids are `crypto.randomUUID()` — 36 characters of hex the writer was
 * asked to transcribe out of a long user turn, once per shot, by instruction alone ("echoing that
 * shot's `cutId` EXACTLY as provided"). A schema that says only `type: "string"` cannot hold it to
 * that, so a single slipped character produced a beat naming a shot that does not exist, `parsePlan`
 * rejected the WHOLE plan ("The writer referenced a shot that isn't in this node."), and the
 * operator paid for a 422. Intermittent by nature, and impossible to prevent with more prose.
 *
 * With `enum`, OpenAI's strict structured outputs constrain DECODING: the model does not type the id
 * and then get checked, it can only select one of these exact strings. A foreign id stops being an
 * error to catch and becomes unrepresentable. That is also why no shorter "shot uid" alias is
 * introduced alongside it — id LENGTH stopped mattering the moment the model stopped transcribing,
 * and a second id namespace would only add a translation layer to drift at.
 *
 * Built from MULTISHOT_PLAN_SCHEMA rather than from a passed-in `spec.schema` because every writer
 * answers against that one object by construction (D238) — an invariant this file's tests assert, so
 * a writer that ever forked its own schema fails there loudly instead of silently getting Omni's
 * shape with the enum bolted on.
 *
 * Returns the UNCONSTRAINED schema for an empty list: `enum: []` is not a satisfiable schema and
 * OpenAI rejects the request outright. The route already 400s a node with no cuts long before here,
 * so this is a guard against a caller that doesn't, not a supported path.
 *
 * Cut counts are small (Kling caps at 6, Seedance's 30s ladder at ~30), comfortably inside strict
 * mode's enum limits.
 */
export function planSchemaForCuts(cutIds: string[]): Record<string, unknown> {
  if (cutIds.length === 0) return MULTISHOT_PLAN_SCHEMA as unknown as Record<string, unknown>;

  const beats = MULTISHOT_PLAN_SCHEMA.properties.beats;
  const item = beats.items;
  return {
    ...MULTISHOT_PLAN_SCHEMA,
    properties: {
      ...MULTISHOT_PLAN_SCHEMA.properties,
      beats: {
        ...beats,
        items: {
          ...item,
          properties: {
            ...item.properties,
            cutId: { ...item.properties.cutId, enum: cutIds },
          },
        },
      },
    },
  };
}

/**
 * The narrow schema a one-shot REFINE asks against.
 *
 * A refine rewrites one thing, so it asks for one thing. The system prompt is shared and unchanged
 * — the writer needs the same ladder guidance, physics, avoid-list and reference rules whatever it
 * is rewriting; only the shape of the answer differs. (D442 — the look refine went with the look.)
 */
export const MULTISHOT_BEAT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["references", "text"],
  properties: {
    references: REFERENCE_READING,
    text: {
      type: "string",
      description:
        "What happens in this one shot: subject, action, framing and camera movement. No timecodes, no durations, no shot numbers.",
    },
  },
} as const;

/**
 * The closing block appended to the user turn on a refine.
 *
 * The current plan travels as context so a rewritten beat still cuts against its neighbours, and
 * the sequence is still recognisably this film. The operator's note is its OWN block: a
 * one-off steer and a standing brief are different things, and a model that cannot tell them apart
 * treats "try it darker" as part of the shot's definition forever after.
 */
export function refineInstruction(args: {
  scope: RefineScope;
  cutId: string | null;
  note: string;
  plan: { beats: Array<{ cutId: string; text: string }> };
}): string {
  const { scope, cutId, note } = args;
  // D442 — only the beats travel: the rules are the operator's and reach the writer in their own
  // block of the user turn, so they are never something it is asked to copy back.
  const plan = { beats: args.plan.beats };

  if (scope === "all") {
    const trimmed = note.trim();
    // No note is a plain Generate — nothing to preserve and nothing to steer, so the turn is left
    // exactly as it was. Deliberately NOT sending the old plan here: a regenerate should write
    // fresh, and handing it the previous output would anchor it to what it just replaced.
    if (!trimmed) return "";

    const blocks: string[] = [];

    // With a note AND an existing plan, the operator can steer part of the sequence — "change
    // shots 5 and 6". That only works if the writer can SEE the beats it is meant to leave alone,
    // so the plan travels and the instruction below asks for them back verbatim.
    //
    // Honest about the limit: this is an instruction, not a guarantee. The per-shot ✦ uses a
    // schema that cannot contain another beat, so nothing else CAN change; here the model is
    // being asked to copy, and a model asked to copy sometimes tidies. Use the per-shot control
    // when a beat must not move.
    if (plan.beats.length > 0) {
      blocks.push(`The current plan is below.\n\n${JSON.stringify(plan, null, 2)}`);
      blocks.push(
        "If the change above names particular shots, rewrite ONLY those. Reproduce every other " +
          "beat EXACTLY as it appears in that plan — the same sentence, word for word, character " +
          "for character. Do not reword it, do not tidy it, do not improve it, do not restate it " +
          "in your own phrasing. A beat you were not asked to change must come back byte-identical. " +
          "If the change names no shot in particular, rewrite the whole sequence.",
      );
    }

    blocks.push(`For this generation in particular: ${trimmed}`);
    return `\n\n${blocks.join("\n\n")}`;
  }

  if (scope === "cut" && !cutId) {
    // A programmer error, not an operator one: the route rejects a cut refine with no shot long
    // before here. Throwing beats emitting "the beat whose cutId is null" into the prompt, which
    // the model would answer as best it could and nothing would flag. Checked BEFORE `blocks` is
    // built (and the plan JSON.stringify'd) so a doomed request fails without doing that work.
    throw new Error("refineInstruction: a cut refine needs a cutId.");
  }

  const blocks: string[] = [`The current plan is below.\n\n${JSON.stringify(plan, null, 2)}`];

  blocks.push(
    `Rewrite ONLY the beat whose cutId is ${cutId}, so it still cuts against the beats either side of it. Return only the text for that shot.`,
  );

  const trimmed = note.trim();
  if (trimmed) {
    blocks.push(
      `Apply this change, and only this change: ${trimmed}\n\nEverything else stays as it is.`,
    );
  }

  return `\n\n${blocks.join("\n\n")}`;
}

export function multishotPromptGenerate(): {
  id: string;
  model: string;
  system: string;
  schema: typeof SCHEMA;
} {
  return {
    id: MULTISHOT_PROMPT_ID,
    model: MULTISHOT_AUTHORING_MODEL,
    system: SYSTEM,
    schema: SCHEMA,
  };
}
