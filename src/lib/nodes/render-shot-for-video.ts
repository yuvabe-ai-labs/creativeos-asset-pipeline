// Render a Shot for a MOTION prompt (D24, sibling of renderShotForImage / D23). The start
// frame already supplies subject/setting/style, so a motion prompt only needs what should
// HAPPEN across the clip: the shot's action description + the strategic objective (the
// motion driver). Overlay copy (on-screen text, caption, CTA) and audio (voiceover, music)
// carry zero motion signal and are dropped.
import type { ReelScript } from "@/lib/nodes/reel-script";

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
