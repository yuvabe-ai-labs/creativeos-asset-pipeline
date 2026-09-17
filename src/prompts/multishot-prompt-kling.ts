// D236/D238 — Kling 3.0 Omni's multishot writer.
//
// Its own system prompt rather than Omni's with a swapped block (operator's call). What is shared
// is imported from multishot-prompt-generate.ts, the canonical file; what differs is here.
//
// The RETURN SHAPE IS IDENTICAL. This writer returns the same plan JSON — {look, beats[{cutId,
// text}]} — and never formats a shot itself. `renderPlan` turns beats into `shot n, m, words;`
// triples, so the writer is never told the wire format and cannot drift from it. That is D238's
// consequence and it is the single most important thing about this file.
import {
  MULTISHOT_SHARED_CRAFT,
  MULTISHOT_PLAN_SCHEMA,
  MULTISHOT_LOOK_BLOCK_RULES,
  MULTISHOT_SHOT_TEXT_CONTRACT,
  referenceIdentificationBlock,
  type MultishotPromptSpec,
} from "./multishot-prompt-generate";
import { MOTION_AVOID_LIST, MULTISHOT_AUTHORING_MODEL } from "./video-prompt-generate";

// @2 (D262): shares the transcribe-or-empty look rule and the no-assumed-setting contract.
// @3 (D263): shares the trimmed, simple-motion craft block.
export const MULTISHOT_KLING_PROMPT_ID = "multishot-prompt-kling@3";

const SYSTEM = `You write the shot-by-shot motion plan for a single multi-shot video generation on Kling 3.0 Omni.

You are given a sequence of SHOTS. Each has an id, the operator's shot text, and its length in
seconds. You return one written beat per shot, plus one LOOK block that governs all of them — or
an empty look, when nothing states one.

${MULTISHOT_LOOK_BLOCK_RULES}

THE BEATS
Return exactly one beat per shot given, echoing that shot's \`cutId\` EXACTLY as provided. Never
invent an id, never merge two shots into one beat, never split one shot across two.

KEEP EACH BEAT UNDER 512 CHARACTERS. This is the API's own per-shot ceiling, not a style
preference: a longer beat is rejected. Write to about 400 so the operator has room to add a
reference handle afterwards without going over. Count as you write — a beat you have to cut
afterwards loses the detail you chose most carefully.

${MULTISHOT_SHOT_TEXT_CONTRACT}

${MULTISHOT_SHARED_CRAFT}

NAMING THINGS THE REFERENCES CARRY
Kling merges two things it cannot tell apart, so distinctness is a hard requirement here:

- Never give two different un-referenced people the same broad description. "A young woman" twice
  produces one person in two places, or a blend of both. Separate them by something the eye can
  hold — wardrobe, hair, height, what they are carrying.
- Where two visually similar products appear in the same shot, say what separates them in space:
  "the tan pair on the left of frame, the black pair on the right, a hand's width between them".
  Without a separator clause Kling returns one hybrid object.
- A referenced subject must be large enough to read — occupying a meaningful part of the frame and
  not hidden behind anything. Do not write a beat whose product is a detail in the far background.
- Do not let one name be contained inside another, and do not reuse a name that also appears as an
  ordinary word elsewhere in the beat.

Do NOT write timecodes, durations, shot numbers, or the words "shot 1" into the text. The timings
are the operator's and are attached to your beats afterwards; anything you write about time or
shot order will contradict them and can corrupt the shot list the API parses.

${referenceIdentificationBlock("triple")}

AVOID
${MOTION_AVOID_LIST}`;

export function multishotPromptKling(): MultishotPromptSpec {
  return {
    id: MULTISHOT_KLING_PROMPT_ID,
    model: MULTISHOT_AUTHORING_MODEL,
    system: SYSTEM,
    // The SAME schema Omni's writer answers against — the plan JSON does not vary by model, only
    // the system prompt and the renderer do (D238). Imported, never copied: the merge path
    // (`mergeRefinedPlan`) depends on this shape, and two copies of it is exactly the drift the
    // reuse rule in AGENTS.md exists to prevent.
    schema: MULTISHOT_PLAN_SCHEMA,
  };
}
