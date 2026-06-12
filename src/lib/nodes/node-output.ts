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
      // A Shot carries the parent script narrowed to one shot (D21). Render only the
      // specific shot here; the full creative brief comes from the parent Script node
      // walked server-side in resolvePromptInputs.
      return renderShotOnly((node.data.script ?? null) as ReelScript | null);
    case "prompt":
      return typeof node.activeOutput === "string" ? node.activeOutput.trim() : "";
    case "script":
      return renderScriptAsText(node.activeOutput as ReelScript | null);
    case "file": {
      // File nodes have no version system — content lives in node.data.
      //
      // Resolution priority (all file kinds):
      //  1. processedOutput  — LLM-extracted description (any kind, useLlm on or off)
      //  2. useLlm on        — extraction not yet run; return "" so the UI shows a nudge
      //  3. image + fileUrl  — sent as vision image_url part; no text contribution
      //  4. rawText          — text files (.txt / .md) extracted at upload time
      //  5. filename hint    — document (PDF/DOCX) with no text yet; URL-only, OpenAI
      //                        cannot fetch arbitrary document URLs, so we emit a
      //                        placeholder so the compiled prompt at least names the file
      const d = node.data as {
        processedOutput?: string;
        rawText?: string;
        filename?: string;
        useLlm?: boolean;
        fileKind?: string;
        fileUrl?: string;
      };
      if (d.processedOutput?.trim()) return d.processedOutput.trim();
      if (d.useLlm) return "";
      if (d.fileKind === "image" && d.fileUrl) return "";
      if (d.rawText?.trim()) return d.rawText.trim();
      if (d.filename) return `[File: ${d.filename}]`;
      return "";
    }
    default:
      if (node.activeOutput == null) return "";
      return typeof node.activeOutput === "string"
        ? node.activeOutput.trim()
        : JSON.stringify(node.activeOutput);
  }
}

// Render just the specific shot (description + duration) for the Shot upstream block.
// The full creative brief is provided separately via the parent Script node.
export function renderShotOnly(script: ReelScript | null): string {
  if (!script) return "";
  const shot = script.visual_script?.shots?.[0];
  if (!shot) return "";
  const lines: string[] = [];
  if (shot.description?.trim()) lines.push(`Shot: ${shot.description.trim()}`);
  if (shot.duration?.trim()) lines.push(`Duration: ${shot.duration.trim()}`);
  return lines.join("\n");
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
