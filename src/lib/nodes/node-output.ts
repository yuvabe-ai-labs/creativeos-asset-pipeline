import type { ReelScript } from "@/lib/nodes/reel-script";

export type NodeOutputInput = {
  type: string;
  data: Record<string, unknown>;
  activeOutput: unknown | null;
};

// Normalize any node's current output to plain text for downstream context.
// Content nodes (Text) read node.data; model nodes (Script/Prompt) read the
// active version's output (D19). Pure + unit-tested.
export function getNodeOutput(node: NodeOutputInput): string {
  switch (node.type) {
    case "text":
      return String(node.data.text ?? "").trim();
    case "shot":
      // A Shot carries the parent script narrowed to one shot (D21); render it the
      // same way as a Script so downstream keeps the full creative context.
      return renderScriptAsText((node.data.script ?? null) as ReelScript | null);
    case "prompt":
      return typeof node.activeOutput === "string" ? node.activeOutput.trim() : "";
    case "script":
      return renderScriptAsText(node.activeOutput as ReelScript | null);
    default:
      if (node.activeOutput == null) return "";
      return typeof node.activeOutput === "string"
        ? node.activeOutput.trim()
        : JSON.stringify(node.activeOutput);
  }
}

// Flatten a parsed reel script into readable labeled text for prompt context.
export function renderScriptAsText(script: ReelScript | null): string {
  if (!script) return "";
  const lines: string[] = [];
  const push = (label: string, v?: string) => {
    if (v && v.trim()) lines.push(`${label}: ${v.trim()}`);
  };

  push("Title", script.title);
  push("Type", script.type);
  push("Duration", script.duration);
  push("Objective", script.strategic_objective);
  push("Production", script.ai_production_type);

  const shots = script.visual_script?.shots ?? [];
  if (shots.length > 0) {
    lines.push("Visual script:");
    shots.forEach((s, i) => {
      if (s.description && s.description.trim()) {
        lines.push(`  ${i + 1}. ${s.description.trim()}${s.duration ? ` (${s.duration})` : ""}`);
      }
    });
  }

  const ost = script.on_screen_text;
  if (ost) {
    push("On-screen intro", ost.intro);
    (ost.body ?? []).forEach((b) => {
      if (b && b.trim()) lines.push(`On-screen: ${b.trim()}`);
    });
    push("On-screen outro", ost.outro);
  }

  push("Voiceover", script.voiceover);
  push("Music & sound", script.music_sound);
  push("Caption", script.caption);
  push("CTA", script.cta);
  push("Thumbnail hook", script.thumbnail_hook);

  return lines.join("\n");
}
