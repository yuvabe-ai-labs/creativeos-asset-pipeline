// D210 — the Multishot Prompt node's writer. A single prompt with NO provider routing: Omni is
// the only multishot model, so there is nothing to branch on.
import {
  MOTION_AVOID_LIST,
  MULTISHOT_AUTHORING_MODEL,
  SUBJECT_SILENT_CAMERA,
} from "@/prompts/video-prompt-generate";

/** Bumped whenever the system text or schema changes; recorded on every version row. */
export const MULTISHOT_PROMPT_ID = "multishot-prompt-generate@1";

/**
 * How to identify an attached reference image and cite it inline via its `<IMAGE_REF_N>` token.
 * The multishot writer's beats are matched against this exact token shape by `refsCitedIn`
 * (src/lib/nodes/multishot-plan.ts). This is the only consumer of this block — it does not belong
 * in video-prompt-generate.ts, which never references it itself (its Omni counterpart was deleted).
 */
export const REFERENCE_IDENTIFICATION_BLOCK = `REFERENCES
When reference images are listed, each one has a token of the form <IMAGE_REF_0>, <IMAGE_REF_1> and so on. WRITE THE TOKEN LITERALLY, inline, at the point in the beat where that subject or product appears — and ALWAYS name what you identified immediately before it:

    [0-3s] A college student crosses a sunlit campus courtyard in the CHUPPS Sliders <IMAGE_REF_0>, bag strap swinging.
    [3-6s] A young professional steps past a cafe chair in the CHUPPS V-Straps <IMAGE_REF_1>, the strap catching the light.

The reference images are ATTACHED to your message. LOOK AT THEM and identify what each one shows — the product, garment, person or surface. Their labels are filenames and mean nothing; you decide which beat each reference belongs in, from the image itself. The operator does not annotate them for you.

Rules for these tokens:
- ALWAYS put a short noun phrase naming the thing immediately BEFORE the token — "the CHUPPS V-Straps <IMAGE_REF_1>", "a young woman <IMAGE_REF_0>". Never a bare token standing alone. Naming it is what lets a wrong identification be caught and corrected in the text rather than in a finished video, and it tells the model what kind of thing it is looking at.
- Use the exact token from the list. Never write "the first image", never write @Image1, never invent a token that is not listed.
- Name the reference IN EVERY BEAT it appears in, not once at the top.
- USE ONLY THE REFERENCES THIS SHOT CALLS FOR. The list is a library, not a checklist. Cite a reference where the shot's own content asks for it and leave the rest out — forcing an unrelated product into a beat in order to "use" it is worse than omitting it. The operator adds any others by hand.
- Never describe a referenced subject's own design in prose beyond that short naming phrase — the reference carries its design, and competing prose produces a hybrid of the two. Describe what the reference cannot: framing, motion, light, wardrobe, ground contact.`;

const SYSTEM = `You write the shot-by-shot motion plan for a single multi-shot video generation.

You are given a sequence of SHOTS. Each has an id, the operator's shot text, and its length in
seconds. You return one written beat per shot, plus one LOOK block that governs all of them.

THE LOOK BLOCK
Open with a single paragraph of look and atmosphere that every beat obeys: light direction and
quality, time of day, lens feel and camera height, palette, ground surface, and grade. Name
REPEATABLE PHYSICAL FACTS, never mood words — "low sun from camera-left, long shadows toward the
lens, warm grey concrete, 35mm at knee height" can be reproduced; "warm cinematic vibe" cannot.
This block is the only thing making separate cuts read as one film. Write it once; do not repeat
it inside the beats.

THE BEATS
Return exactly one beat per shot given, echoing that shot's \`cutId\` EXACTLY as provided. Never
invent an id, never merge two shots into one beat, never split one shot across two.

Each beat says what HAPPENS in that shot — subject, action, and the camera's framing and movement.
Decide framing yourself, and cut well:
- Vary shot size between consecutive beats. Two adjacent beats at the same distance read as a
  mistake rather than a cut.
- Change the angle by at least 30 degrees between consecutive beats on the same subject.
- Hold one screen direction across the whole sequence.
- Where a movement carries across a cut, name it in BOTH beats so the halves join.

${SUBJECT_SILENT_CAMERA}

Do NOT write timecodes, durations or shot numbers into the text. The timings are the operator's
and are added afterwards; anything you write about time will contradict them.

${REFERENCE_IDENTIFICATION_BLOCK}

AVOID
${MOTION_AVOID_LIST}`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["look", "beats"],
  properties: {
    look: {
      type: "string",
      description:
        "One paragraph of look and atmosphere governing every beat: light direction, time of day, lens feel, palette, ground, grade. Repeatable physical facts only.",
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

export function multishotPromptGenerate(): {
  id: string;
  model: string;
  system: string;
  schema: object;
} {
  return {
    id: MULTISHOT_PROMPT_ID,
    model: MULTISHOT_AUTHORING_MODEL,
    system: SYSTEM,
    schema: SCHEMA,
  };
}
