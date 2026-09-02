// Render a Shot for a MOTION prompt (D24, sibling of renderShotForImage / D23). The start
// frame already supplies subject/setting/style, so a motion prompt only needs what should
// HAPPEN across the clip: the shot's action description + the strategic objective (the
// motion driver). Overlay copy (on-screen text, caption, CTA) and audio (voiceover, music)
// carry zero motion signal and are dropped.
import type { ReelScript } from "@/lib/nodes/reel-script";
import { shotSeconds } from "@/lib/nodes/group-shots";
import type { VideoControls } from "@/lib/nodes/video-controls";

export function renderShotForVideo(script: ReelScript | null): string {
  if (!script) return "";
  const lines: string[] = [];
  const shot = script.visual_script?.shots?.[0];
  if (shot?.description && shot.description.trim()) {
    lines.push(`Action: ${shot.description.trim()}`);
  }
  if (script.strategic_objective && script.strategic_objective.trim()) {
    lines.push(`Objective: ${script.strategic_objective.trim()}`);
  }
  return lines.join("\n");
}

/**
 * A multishot node's beats as Omni's documented timecode ladder.
 *
 * Times are cumulative and derived from each beat's own length, so the ladder always sums to the
 * node's total — which is what the request's `duration` is derived from. The two agreeing by
 * construction is the point: a ladder longer than the duration comes back truncated, at full price.
 */
export function renderShotLadder(script: ReelScript | null): string {
  const shots = script?.visual_script?.shots ?? [];
  if (shots.length === 0) return "";
  let at = 0;
  return shots
    .map((shot) => {
      const from = at;
      at += shotSeconds(shot);
      return `[${from}-${at}s] ${(shot.description ?? "").trim()}`;
    })
    .join("\n");
}

/**
 * D201 — the user turn for a MULTISHOT motion prompt: the LOOK, the timecode ladder, the objective.
 *
 * The LOOK is passed through untouched. The system prompt reproduces it character-for-character,
 * and anything done to it here would be precisely the paraphrase the guidance warns against.
 *
 * No per-beat camera line. There was one; it is gone with the control that set it. Framing is the
 * prompt writer's call now — it carries the rules that decide framing across a cut (vary shot size,
 * 30 degrees or a size change between consecutive beats on one subject, one screen direction
 * throughout), and a fixed camera clause per beat could only fight them.
 */
export function renderMultishotBrief(args: {
  script: ReelScript | null;
  controls: VideoControls;
}): string {
  const shots = args.script?.visual_script?.shots ?? [];
  if (shots.length === 0) return "";

  const blocks: string[] = [];

  const look = (args.controls.look ?? "").trim();
  if (look) blocks.push(`LOOK — ${look}`);

  blocks.push(`Beats (keep these timings exactly):\n${renderShotLadder(args.script)}`);

  const objective = (args.script?.strategic_objective ?? "").trim();
  if (objective) blocks.push(`Objective: ${objective}`);

  return blocks.join("\n\n");
}
