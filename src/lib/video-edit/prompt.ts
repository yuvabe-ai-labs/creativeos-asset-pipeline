// D483 — what Omni's edit task is sent. Google's Omni guide (checked 2026-11-10): reference images
// are supported for video editing; control strings such as `<IMAGE_REF_0>` are deprecated and
// unsupported in future models, so each image is described in plain words; simple prompts work
// best, ending with "Keep everything else the same".
import { mentionDialect } from "@/lib/nodes/prompt-token-dialect";

const KEEP_LINE = "Keep everything else the same.";

export type EditReference = { id: string; label: string };

/** The connected images an instruction @-mentions, in the order they appear, without repeats. */
export function mentionedImageIds(instruction: string): string[] {
  const ids = mentionDialect()
    .parse(instruction)
    .flatMap((s) => (s.kind === "mention" ? [s.id] : []));
  return [...new Set(ids)];
}

/** The instruction with each @-mention written as plain words: "the pack (reference image 2)". */
export function plainInstruction(instruction: string, references: EditReference[]): string {
  const at = new Map(references.map((r, i) => [r.id, i]));
  return mentionDialect()
    .parse(instruction)
    .map((s) => {
      if (s.kind === "text") return s.text;
      const i = at.get(s.id);
      return i === undefined ? references.find((r) => r.id === s.id)?.label ?? s.label : `${references[i].label} (reference image ${i + 1})`;
    })
    .join("")
    .trim();
}

/** The instruction for display: mentions as their names, no ids. */
export function instructionForDisplay(instruction: string): string {
  return mentionDialect()
    .parse(instruction)
    .map((s) => (s.kind === "text" ? s.text : s.label.replace(/^[^:]+:\s*/, "")))
    .join("")
    .trim();
}

export function composeVideoEditPrompt(a: { instruction: string; references: EditReference[] }): string {
  const parts = [plainInstruction(a.instruction, a.references)];
  if (a.references.length > 0) {
    parts.push(`Reference images, in the order attached: ${a.references.map((r, i) => `${i + 1}. ${r.label}.`).join(" ")}`);
  }
  parts.push(KEEP_LINE);
  return parts.join("\n\n");
}
