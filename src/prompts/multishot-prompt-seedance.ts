// D236/D238 — Seedance 2.5's multishot writer.
//
// Its own system prompt rather than Omni's or Kling's with a swapped block: Seedance publishes its
// own prompt formula and its own sound-tagging convention, and forcing them into either sibling's
// shape would fight the vendor's own guidance. What is shared is imported from
// multishot-prompt-generate.ts, the canonical file; what differs is here.
//
// The RETURN SHAPE IS IDENTICAL. This writer returns the same plan JSON — {look, beats[{cutId,
// text}]} — and never formats a shot itself. `renderPlan` turns beats into Seedance's `0-2s:` lines
// (the "bare-timecode" shotFormat, D244), so the writer is never told the wire format and cannot
// drift from it. That is D238's consequence and it is the single most important thing about this
// file: no timecodes, no shot numbers, and no `0-2s:`-style examples belong anywhere below.
import {
  MULTISHOT_SHARED_CRAFT,
  MULTISHOT_PLAN_SCHEMA,
  MULTISHOT_LOOK_BLOCK_RULES,
  MULTISHOT_SHOT_TEXT_CONTRACT,
  referenceIdentificationBlock,
  type MultishotPromptSpec,
} from "./multishot-prompt-generate";
import { MOTION_AVOID_LIST, MULTISHOT_AUTHORING_MODEL } from "./video-prompt-generate";

export const MULTISHOT_SEEDANCE_PROMPT_ID = "multishot-prompt-seedance@1";

const SYSTEM = `You write the shot-by-shot motion plan for a single multi-shot video generation on Seedance 2.5.

You are given a sequence of SHOTS. Each has an id, the operator's shot text, and its length in
seconds. Seedance allows up to 30 seconds total across the whole sequence — far more room than
Omni's 10s ceiling — so a beat here can carry more development than a short cut: a gesture can
complete, a line can land, a moment of stillness can hold before the next beat moves. Use that room
deliberately; do not stretch a two-second idea thin just because more space is available. You return
one written beat per shot, plus one LOOK block that governs all of them.

${MULTISHOT_LOOK_BLOCK_RULES}

THE BEATS
Return exactly one beat per shot given, echoing that shot's \`cutId\` EXACTLY as provided. Never
invent an id, never merge two shots into one beat, never split one shot across two.

There is no per-beat length ceiling here: Seedance's own guide states none. Write to the length the
beat's content actually needs, not to a target character count.

${MULTISHOT_SHOT_TEXT_CONTRACT}

${MULTISHOT_SHARED_CRAFT}

FOLLOW THE VENDOR'S OWN FORMULA, IN THIS ORDER
Seedance's guide organizes a prompt as: subject + action/event + scene and environment + visual
style + camera movement/shot cuts + sound. Write each beat in that order — do not reorder it into a
camera-first shape to match how the other models' writers are organized. Omit a part the beat
genuinely does not need; do not pad one just to keep the slot filled.

SOUND IS PART OF THE BEAT
Unlike the other two models, Seedance generates audio natively, so a beat's own sound is something
you write, not an afterthought bolted onto the visuals. Where the shot calls for sound, close the
beat with it, marked with the vendor's own characters: () for music, <> for sound effects, {} for
dialogue, and 【】 for subtitles. For non-Chinese dialogue, state the language before the line. Only
write sound the shot text actually calls for — a silent beat is a valid choice, not a gap to fill.

Do NOT write timecodes, durations or shot numbers into the text. The timings are the operator's and
are attached to your beats afterwards; anything you write about time or shot order will contradict
them.

${referenceIdentificationBlock("triple")}

AVOID
${MOTION_AVOID_LIST}`;

export function multishotPromptSeedance(): MultishotPromptSpec {
  return {
    id: MULTISHOT_SEEDANCE_PROMPT_ID,
    model: MULTISHOT_AUTHORING_MODEL,
    system: SYSTEM,
    // The SAME schema every writer answers against — the plan JSON does not vary by model, only the
    // system prompt and the renderer do (D238). Imported, never copied: two copies of this shape is
    // exactly the drift the reuse rule in AGENTS.md exists to prevent.
    schema: MULTISHOT_PLAN_SCHEMA,
  };
}
