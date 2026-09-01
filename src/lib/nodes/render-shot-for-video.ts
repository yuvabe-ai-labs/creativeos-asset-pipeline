// Render a Shot for a MOTION prompt (D24, sibling of renderShotForImage / D23). The start
// frame already supplies subject/setting/style, so a motion prompt only needs what should
// HAPPEN across the clip: the shot's action description + the strategic objective (the
// motion driver). Overlay copy (on-screen text, caption, CTA) and audio (voiceover, music)
// carry zero motion signal and are dropped.
import type { ReelScript } from "@/lib/nodes/reel-script";
import { shotSeconds } from "@/lib/nodes/group-shots";
import {
  VIDEO_CONTROLS,
  beatControlsFor,
  type VideoControls,
} from "@/lib/nodes/video-controls";

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

const CAMERA_PROSE = new Map(
  (VIDEO_CONTROLS.find((group) => group.key === "camera")?.options ?? []).map((option) => [
    option.value,
    option.prose,
  ]),
);

/**
 * D201 — the user turn for a MULTISHOT motion prompt: the LOOK, the ladder with each beat's own
 * camera, and the objective.
 *
 * The LOOK is passed through untouched. The system prompt reproduces it character-for-character,
 * and anything done to it here would be precisely the paraphrase the guidance warns against.
 *
 * A beat left on "auto" gets no camera line at all — "auto" is the no-constraint option, and
 * emitting a sentence for it would put words in the prompt the operator never chose.
 */
export function renderMultishotBrief(args: {
  script: ReelScript | null;
  controls: VideoControls;
}): string {
  const shots = args.script?.visual_script?.shots ?? [];
  if (shots.length === 0) return "";

  const cameras = beatControlsFor(args.controls, shots.length);
  const blocks: string[] = [];

  const look = (args.controls.look ?? "").trim();
  if (look) blocks.push(`LOOK — ${look}`);

  let at = 0;
  const ladder = shots.map((shot, i) => {
    const from = at;
    at += shotSeconds(shot);
    const line = `[${from}-${at}s] ${(shot.description ?? "").trim()}`;
    const prose = CAMERA_PROSE.get(cameras[i]?.camera ?? "auto") ?? "";
    return prose ? `${line}\n    Camera: ${prose}.` : line;
  });
  blocks.push(`Beats (keep these timings exactly):\n${ladder.join("\n")}`);

  const objective = (args.script?.strategic_objective ?? "").trim();
  if (objective) blocks.push(`Objective: ${objective}`);

  return blocks.join("\n\n");
}
