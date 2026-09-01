import { avoidClause } from "./providers/avoid-clause";
import type { OmniInputPlan } from "./plan-omni-input";

/**
 * D187 — Omni generates an audio track ALWAYS. There is no off switch anywhere in the API, so
 * this steers the track rather than enabling it. Each value is a documented clause shape.
 *
 * `ambient` is the default because Omni has no voice control of any kind — no reference upload,
 * no cloning, no fixing a voice in a later turn. A narrator therefore differs between generations
 * and cannot be corrected, so any deliverable spanning more than one generation lays a single
 * continuous VO in the edit instead of asking for speech here.
 */
export const OMNI_AUDIO_CLAUSES: Record<string, string> = {
  dialogue: "Sound design: ambience, foley and the spoken line. No background music.",
  ambient: "Sound design: ambience and foley only. No dialogue. No background music.",
  music: "Sound design: ambience, foley and a music bed.",
};

/**
 * Suppressed on every shot that does not explicitly ask for on-screen text.
 *
 * Omni renders screen-space type well, which is the problem: left alone it invents signage,
 * captions and packaging copy nobody asked for. When `on_screen_text` IS set the operator's copy
 * is quoted instead and this line is dropped, so the two never contradict each other.
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

  const onScreenText = String(params.on_screen_text ?? "").trim();
  if (onScreenText) blocks.push(`On-screen text reads exactly: "${onScreenText}".`);

  const audio = String(params.audio ?? "dialogue");
  blocks.push(OMNI_AUDIO_CLAUSES[audio] ?? OMNI_AUDIO_CLAUSES.dialogue);

  // Only when the operator asked for none. With copy set, the quoted line above governs and this
  // would contradict it.
  if (!onScreenText) blocks.push(NO_ON_SCREEN_TEXT_LINE);

  const avoid = avoidClause(String(params.negative_prompt ?? ""));
  if (avoid) blocks.push(avoid);

  if (plan.guidance) blocks.push(plan.guidance);

  return blocks.join("\n\n");
}
