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
export const OMNI_AUDIO_CLAUSE =
  "Sound design: ambience, foley and the spoken line. No background music.";

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
  blocks.push(OMNI_AUDIO_CLAUSE);
  blocks.push(NO_ON_SCREEN_TEXT_LINE);

  const avoid = avoidClause(String(params.negative_prompt ?? ""));
  if (avoid) blocks.push(avoid);

  if (plan.guidance) blocks.push(plan.guidance);

  return blocks.join("\n\n");
}
