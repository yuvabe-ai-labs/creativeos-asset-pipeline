// D210 — the Multishot Prompt node's writer. A single prompt with NO provider routing: Omni is
// the only multishot model, so there is nothing to branch on.
import {
  REFERENCE_IDENTIFICATION_BLOCK,
  MOTION_AVOID_LIST,
  MULTISHOT_AUTHORING_MODEL,
} from "@/prompts/video-prompt-generate";

/** Bumped whenever the system text or schema changes; recorded on every version row. */
export const MULTISHOT_PROMPT_ID = "multishot-prompt-generate@1";

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
