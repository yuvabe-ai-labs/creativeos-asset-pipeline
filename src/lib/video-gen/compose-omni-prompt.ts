import { avoidClause } from "./providers/avoid-clause";
import type { OmniInputPlan } from "./plan-omni-input";

/**
 * D208 — Omni generates an audio track ALWAYS. There is no off switch anywhere in the API, so
 * this steers the track rather than enabling it. Each value is a documented clause shape.
 *
 * `ambient` is the default because Omni has no voice control of any kind — no reference upload,
 * no cloning, no fixing a voice in a later turn. A narrator therefore differs between generations
 * and cannot be corrected, so any deliverable spanning more than one generation lays a single
 * continuous VO in the edit instead of asking for speech here.
 */
/**
 * The single sound-design clause, emitted on every shot.
 *
 * Was a three-way map keyed by an `audio` param (dialogue / ambient / music) until that control
 * was removed. Only this arm survives, because it is the one that suppresses a background score —
 * Omni's audio cannot be switched off, and a per-generation music bed changes character at every
 * cut, so a multi-generation deliverable needs it gone. The other two arms are recoverable from
 * git if the control ever returns; an unreachable map keyed by a param nothing sets is not.
 */
export const NO_MUSIC = "No background music.";

// How renderVoiceover (src/lib/nodes/voiceover.ts) writes a line, in its current shape and the
// one before D472, so a prompt edited by hand or written before still reads right.
const NARRATOR_LINE = /\bVoiceover(?:, off-screen)?(?: \([^)]*\))?(?: in [^:"“]+)?: ["“]/;
const ON_CAMERA_LINE = /\bsays(?: on camera)?(?: \([^)]*\))?(?: in [^:"“]+)?: ["“]/;

/**
 * D472 — the sound clause, decided by what the prompt actually asks to be spoken. It was one fixed
 * line ("ambience, foley and the spoken line") on every request, so a clip with no line was told
 * to have one and the model made one up; and nothing told it who speaks, so a narrator's line
 * came out of the on-screen person's mouth. Omni, Kling and Seedance all make sound by default.
 */
// D474 — when the words are spoken. Without it the model let the room sound run first: a 4s clip's
// seven-word voiceover began at 2.7s and was still being spoken when the clip ended (staging,
// CaratLane Reel 02).
export const SPEECH_TIMING = "Speaking starts within the first second and every line is finished before the clip ends; no line is cut off.";

export function soundDesignClause(prompt: string): string {
  const narrator = NARRATOR_LINE.test(prompt);
  const onCamera = ON_CAMERA_LINE.test(prompt);
  if (narrator && onCamera) {
    return "Sound design: ambience, foley and only the lines given, in exactly their words: the voiceover spoken " +
      `off-screen, and each on-camera line said by the person named. Nobody else speaks. ${SPEECH_TIMING} ${NO_MUSIC}`;
  }
  if (onCamera) {
    return "Sound design: ambience, foley and the lines given, each said on camera by the person named, in exactly " +
      `the words given. Nobody else speaks, and there is no voiceover. ${SPEECH_TIMING} ${NO_MUSIC}`;
  }
  if (narrator) {
    return "Sound design: ambience, foley and the voiceover, spoken off-screen in exactly the words given and " +
      `nothing more. Nobody on screen speaks or moves their lips as if talking. ${SPEECH_TIMING} ${NO_MUSIC}`;
  }
  return "Sound design: ambience and foley only. Nobody speaks: no dialogue, no voiceover, no narration, no " +
    `singing. ${NO_MUSIC}`;
}

/**
 * D484 — the sound rule for ONE entry of fal's Kling shot list, which caps every shot at 512
 * characters. `soundDesignClause` alone runs to 300, so each shot carries this short form (same
 * decision about who speaks), and only the first shot adds `SPEECH_TIMING`.
 */
export function shortSoundLine(prompt: string): string {
  const narrator = NARRATOR_LINE.test(prompt);
  const onCamera = ON_CAMERA_LINE.test(prompt);
  if (narrator && onCamera) return "Only the given lines are spoken: the voiceover off-screen, the rest on camera by the person named. No music.";
  if (onCamera) return "Only the given lines are spoken, on camera by the person named. No voiceover, no music.";
  if (narrator) return "Only the voiceover is spoken, off-screen. Nobody on screen speaks. No music.";
  return "Ambience and foley only. Nobody speaks. No music.";
}

/** Whether the prompt has a line to be spoken, by a narrator or on camera. */
export function hasSpokenLine(prompt: string): boolean {
  return NARRATOR_LINE.test(prompt) || ON_CAMERA_LINE.test(prompt);
}

/** The longest `shortSoundLine`, for budgets that must hold whichever one is sent. */
export const SHORT_SOUND_LINE_MAX_CHARS = 108;

/**
 * Emitted on EVERY shot.
 *
 * Omni renders screen-space type well, which is the problem: left alone it invents signage,
 * captions and packaging copy nobody asked for. There used to be an `on_screen_text` param whose
 * copy would be quoted instead, and this line was dropped in that case so the two could not
 * contradict each other; that control is gone, so the suppression is now unconditional.
 */
export const NO_ON_SCREEN_TEXT_LINE = "No on-screen text.";

/**
 * The complete text part of an Omni request.
 *
 * Order follows the vendor's documented shape: declaration header, prompt body, on-screen text,
 * sound design, negatives, then the closing role guidance. Negatives sit near the end as their own
 * paragraph so a comma-separated defect list cannot read as a continuation of the last shot
 * sentence — the same reasoning as composeVeoPrompt (D183).
 *
 * The prompt arrives already shaped: a timecode ladder for a multishot shot, or a single-moment
 * description plus its no-cuts instruction for a single one. That decision belongs to the
 * motion-prompt node, which is the only place that knows the upstream shot's multishot flag.
 */
export function composeOmniPrompt(args: {
  prompt: string;
  params: Record<string, unknown>;
  plan: OmniInputPlan;
}): string {
  const { prompt, params, plan } = args;

  const blocks: string[] = [];
  if (plan.header) blocks.push(plan.header);
  blocks.push(prompt.trim());

  // Both clauses are now FIXED — the Audio select and the On-screen Text box were removed from the
  // node (operator request 2026-09-03). Removing the controls must not remove the behaviour they
  // governed, and in both cases the default was doing real work:
  //
  //  - Omni ALWAYS generates audio and it cannot be switched off. Dropping the clause does not
  //    give silence, it gives whatever Omni decides — including the music bed this clause exists
  //    to suppress, which changes character at every cut.
  //  - Omni renders screen-space type well, which is the problem: unprompted it invents signage,
  //    captions and packaging copy. With no opt-in left, the suppression is unconditional.
  blocks.push(soundDesignClause(prompt));
  blocks.push(NO_ON_SCREEN_TEXT_LINE);

  const avoid = avoidClause(String(params.negative_prompt ?? ""));
  if (avoid) blocks.push(avoid);

  if (plan.guidance) blocks.push(plan.guidance);

  return blocks.join("\n\n");
}
