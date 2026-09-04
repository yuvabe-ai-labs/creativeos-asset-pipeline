// Render a Shot for a MOTION prompt (D24, sibling of renderShotForImage / D23). The start
// frame already supplies subject/setting/style, so a motion prompt only needs what should
// HAPPEN across the clip: the shot's action description + the strategic objective (the
// motion driver). Overlay copy (on-screen text, caption, CTA) and audio (voiceover, music)
// carry zero motion signal and are dropped.
import type { ReelScript } from "@/lib/nodes/reel-script";

export function renderShotForVideo(script: ReelScript | null): string {
  if (!script) return "";
  const lines: string[] = [];

  // EVERY row, not just the first. A Shot node covers a whole generation and generates it as one
  // continuous take, so reading shots[0] silently dropped the rest of what it covers.
  const action = (script.visual_script?.shots ?? [])
    .map((s) => (s.description ?? "").trim())
    .filter(Boolean)
    .map((s, i) => (i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)))
    .join(" ");
  if (action) lines.push(`Action: ${action}`);

  if (script.strategic_objective && script.strategic_objective.trim()) {
    lines.push(`Objective: ${script.strategic_objective.trim()}`);
  }
  return lines.join("\n");
}
