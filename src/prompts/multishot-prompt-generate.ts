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
} from "@/prompts/video-prompt-generate";
import type { RefineScope } from "@/lib/nodes/refine-suggestions";

/** Bumped whenever the system text or schema changes; recorded on every version row. */
// @5 (D262): the look is transcribed from stated direction or left empty; no assumed setting.
// @6 (D263): motion trimmed to one plain action, a simple camera and a grounding line.
export const MULTISHOT_PROMPT_ID = "multishot-prompt-generate@6";

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
      ? `    A college student crosses a campus courtyard in the black CHUPPS V-Straps.
    A young professional steps past a cafe chair in the tan CHUPPS Sliders.`
      : `    [0-3s] A college student crosses a campus courtyard in the black CHUPPS V-Straps.
    [3-6s] A young professional steps past a cafe chair in the tan CHUPPS Sliders.`;

  return `REFERENCES
The reference images are ATTACHED to your message. LOOK AT THEM and identify what each one shows. Their labels are filenames and mean nothing; what a reference is, you decide from the image itself.

DO NOT WRITE REFERENCE TOKENS. Never write <IMAGE_REF_0>, "the first image", @Image1, or any other pointer into the attachment list. Which picture binds to which beat is the operator's decision, made by hand after reading your draft. A token you assign yourself binds a specific photograph silently, and a wrong binding raises no error — it is only visible in a clip already paid for.

Instead, NAME WHAT YOU SAW, in prose, wherever that thing appears in a beat:

${example}

A short identifying phrase — colour, material, product name — is exactly right: "the black CHUPPS V-Straps", "the tan leather sliders", "a young woman in a loose oatmeal shirt". It tells the operator which attachment you meant, so a misreading is caught in the text rather than in a finished video, and it gives them the anchor to attach the reference to. Do not go further into that product's own design: the reference carries its geometry, stitching and logo placement, and prose competing with it produces a hybrid of the two. Describe instead what the reference cannot — framing, motion, light, wardrobe, ground contact.

Name the thing IN EVERY BEAT it appears in, not once at the top.

NOT EVERY ATTACHMENT IS A THING THAT CAN APPEAR IN A SCENE. Decide which KIND each one is before naming it:

- A PRODUCT, PERSON, GARMENT or SURFACE — something physical that exists in the world of the shot. Name it wherever the shot puts it.
- A BRAND MARK — a logo, wordmark or lock-up, usually alone on a plain white background. This is a GRAPHIC, not an object. It is not footwear, it is not worn, it does not walk, and it cannot be set down on a surface. NEVER name it as a product and never let it stand in for one: a mark misread as a shoe is the single worst reference error, because the beat then asks the model to animate a logo as if it had feet.

  When a shot asks for the logo — "…followed by logo", "end on the brand mark" — write the shot the frame actually needs and stop there: the product arrangement, the final held framing, and clear, uncluttered space where the mark will sit. The lock-up is composited in post, where the type is exact. Generated lettering is not, and this request carries a standing instruction against screen-space type anyway.

USE ONLY THE REFERENCES THIS SHOT CALLS FOR. The attachments are a library, not a checklist. Name a product where the shot's own content asks for it and leave the rest out — forcing an unrelated product into a beat in order to "use" it is worse than omitting it. The operator adds any others by hand.`;
}

/** Omni's copy — byte-identical to what shipped before this became a function. */
export const REFERENCE_IDENTIFICATION_BLOCK = referenceIdentificationBlock("timecode");

/**
 * The LOOK BLOCK instruction: what the single top-of-plan paragraph must do (repeatable physical
 * facts, not mood words) and why it is written once rather than repeated per beat. This is our
 * contract with the operator about how a plan is structured, not a vendor constraint, so both
 * writers share it verbatim (D231/D238) rather than each carrying a copy that can drift.
 *
 * D262 — the look is TRANSCRIBED from stated direction, never composed. It used to be mandatory,
 * which forced the writer to invent a light, a season and a place for every script that stated
 * none — and it reached for the brand context to do it, which is how CHUPPS reels kept arriving in
 * the monsoon. Blank is now the right answer when nothing states a look.
 */
export const MULTISHOT_LOOK_BLOCK_RULES = `THE LOOK BLOCK
The look block is one paragraph of look and atmosphere that every beat obeys: light direction and
quality, time of day, lens feel and camera height, palette, ground surface, and grade. Write it
ONLY from look direction that is actually stated — in the shot texts, in the script's production
notes, or in the operator's instructions. Transcribe what is stated; do not complete it. If the
script gives a time of day and nothing else, the look is that time of day and nothing else.

Never derive the look from the brand context, the product, the market, the season or the
reference images. None of those is a statement of how THIS film looks, and filling the gap from
them invents a setting the script never asked for.

If nothing states any look direction, return an empty string for the look. An empty look is
correct, not a failure — do not write a default.

Where you do write it, name REPEATABLE PHYSICAL FACTS, never mood words — "low sun from
camera-left, long shadows toward the lens" can be reproduced; "warm cinematic vibe" cannot. Write
it once; do not repeat it inside the beats.`;

/**
 * The beat contract: the operator's shot text is the brief the beat renders, not a suggestion to
 * improve on, and a shot text naming several camera setups still gets rendered as ONE beat. Also
 * ours rather than a vendor's, and also shared verbatim (D231/D238) for the same reason as the look
 * block above.
 */
export const MULTISHOT_SHOT_TEXT_CONTRACT = `THE SHOT TEXT IS THE BRIEF
The operator's shot text is what that shot IS. Your beat RENDERS it; it does not replace it. Do not
substitute a different subject, setting or action, and do not add people, props or places the shot
text does not call for.

Do not add weather, season, time of day or location that the shot text, the script's production
notes and the operator's instructions do not state. The brand context tells you how the brand
speaks, what the product is called and what it may not claim. It is NOT a source of setting: a
brand known for rain-ready footwear does not make an unstated shot rainy.

A shot text often names more than one camera setup — "Rapid close-ups. A man picks up his keys. A
woman steps out of a cab. Someone grabs a coffee." A beat of a few seconds cannot hold four setups,
and trying is the single biggest reason a generation comes back as mush. Choose the ONE the shot
leads with, or the one its length can actually carry, and render that completely. The operator
splits the rest into their own shots when they want them.`;

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
 * What IS shared with Kling's prompt, verbatim, beyond this block: MULTISHOT_LOOK_BLOCK_RULES and
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
woman in a loose linen shirt"), but add no setting the shot text does not name.

Do not write on-screen text, captions, titles or signage copy into a beat. The request carries a
standing instruction against screen-space type, and asking for lettering here would contradict it.

PRESERVATION
A referenced product must survive the beat unchanged: shape, proportions, colour, and any
lettering or logo held exactly. Say so in the beat whenever the product is on screen — "the strap
geometry and printed logo hold exactly". Left unsaid, the model drifts the label, changes how many
of a thing there are, or hybridises two references.`;

const SYSTEM = `You write the shot-by-shot motion plan for a single multi-shot video generation.

You are given a sequence of SHOTS. Each has an id, the operator's shot text, and its length in
seconds. You return one written beat per shot, plus one LOOK block that governs all of them — or
an empty look, when nothing states one.

${MULTISHOT_LOOK_BLOCK_RULES}

THE BEATS
Return exactly one beat per shot given, echoing that shot's \`cutId\` EXACTLY as provided. Never
invent an id, never merge two shots into one beat, never split one shot across two.

${MULTISHOT_SHOT_TEXT_CONTRACT}

${MULTISHOT_SHARED_CRAFT}

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

/** Shared verbatim across SCHEMA and MULTISHOT_LOOK_SCHEMA — see the reuse rule in AGENTS.md. */
const LOOK_DESCRIPTION =
  "One paragraph of look and atmosphere governing every beat — light direction, time of day, lens feel, palette, ground, grade — written only from look direction the shot texts, the script's production notes or the operator state. Repeatable physical facts only. An empty string when nothing states any.";

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
  required: ["look", "beats"],
  properties: {
    look: {
      type: "string",
      description: LOOK_DESCRIPTION,
    },
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
 * The narrow schemas a REFINE asks against.
 *
 * A refine rewrites one thing, so it asks for one thing. The system prompt is shared and unchanged
 * — the writer needs the same ladder guidance, physics, avoid-list and reference rules whatever it
 * is rewriting; only the shape of the answer differs.
 */
export const MULTISHOT_LOOK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["look"],
  properties: {
    look: {
      type: "string",
      description: LOOK_DESCRIPTION,
    },
  },
} as const;

export const MULTISHOT_BEAT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text"],
  properties: {
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
 * a rewritten look is still recognisably this film. The operator's note is its OWN block: a
 * one-off steer and a standing brief are different things, and a model that cannot tell them apart
 * treats "try it darker" as part of the shot's definition forever after.
 */
export function refineInstruction(args: {
  scope: RefineScope;
  cutId: string | null;
  note: string;
  plan: { look: string; beats: Array<{ cutId: string; text: string }> };
}): string {
  const { scope, cutId, note, plan } = args;

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
          "The same applies to the look block: leave it exactly as it is unless the change asks " +
          "for it. If the change names no shot in particular, rewrite the whole sequence.",
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
    scope === "look"
      ? "Rewrite ONLY the look block, so the beats below it still make sense under it. Return only the look."
      : `Rewrite ONLY the beat whose cutId is ${cutId}, so it still cuts against the beats either side of it. Return only the text for that shot.`,
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
