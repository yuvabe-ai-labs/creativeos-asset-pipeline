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
    case "draw":
      // Draw node carries composition instructions as its text output; the sketch image
      // travels separately via fileUrl → vision attachment. Mirrors the "text" case (D19).
      return String(node.data.instructions ?? "").trim();
    case "shot":
      // A Shot carries the parent script narrowed to ONE shot (D21), but it feeds ONE
      // reference image — so by default render only the visually-actionable fields, not
      // the whole reel brief (D23). SHOT_CONTEXT_MODE=full flips back to the full reel
      // for A/B testing (shotContextMode / renderShotContext).
      return renderShotContext((node.data.script ?? null) as ReelScript | null, shotContextMode());
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

// Render a Shot for a single reference IMAGE (D23). A Shot still carries the full reel
// script narrowed to one shot (D21), but only two fields are visually actionable: the
// shot's own description (subject/action/framing/lighting/surface) and the production
// medium. Everything else in a reel script — title, type, duration, objective, on-screen
// text, voiceover, music, caption, CTA, thumbnail hook — is audio / marketing / overlay
// copy that (a) dilutes the per-shot signal, (b) drives homogeneity (every VISUAL shot's
// objective says "slow luxury cinematic"), and (c) risks baked-in text in the plate.
// Brand palette + casting come from the KB block; lens/lighting from Shot controls — so
// we don't repeat them here. (The full-reel renderScriptAsText is still used by Script
// nodes, which legitimately want the whole brief as downstream text context.)
export function renderShotForImage(script: ReelScript | null): string {
  if (!script) return "";
  const lines: string[] = [];
  const shot = script.visual_script?.shots?.[0];
  if (shot?.description && shot.description.trim()) lines.push(shot.description.trim());
  if (script.ai_production_type && script.ai_production_type.trim()) {
    lines.push(`Medium: ${script.ai_production_type.trim()}`);
  }
  return lines.join("\n");
}

// Which shot-context renderer feeds image prompts:
//   "minimal" → renderShotForImage (D23 default — trimmed to the visually-actionable fields)
//   "full"    → renderScriptAsText (pre-D23 — the whole reel brief)
export type ShotContextMode = "minimal" | "full";

// Render a Shot's carried script for an image prompt in the chosen mode (pure; testable
// for both arms). The global default is resolved by shotContextMode() at the call site.
export function renderShotContext(script: ReelScript | null, mode: ShotContextMode): string {
  return mode === "full" ? renderScriptAsText(script) : renderShotForImage(script);
}

// The global shot-context switch (D23). Flip the whole app between the trimmed (D23) and
// the full-reel context via the SHOT_CONTEXT_MODE env var so a Run-02 A/B can compare the
// two without code changes. Read defensively: only the exact string "full" opts into the
// full brief; anything else (incl. unset / client-side where non-public env is undefined)
// falls back to "minimal".
export function shotContextMode(): ShotContextMode {
  return process.env.SHOT_CONTEXT_MODE === "full" ? "full" : "minimal";
}
