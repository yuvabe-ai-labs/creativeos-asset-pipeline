// The Prompt node's `compile` step — pure: (client context + upstream outputs +
// instruction) → the model payload. The `user` string is the visible "final
// compiled prompt" the PRD requires be shown before generation (ADR D3).
import { promptGeneratePrompt } from "@/prompts/prompt-generate";

// The instruction sent when the operator leaves the Inline box blank. Exported so
// the Prompt focus view can show the exact sentence the model will receive.
export const DEFAULT_INSTRUCTION =
  "Write a detailed image prompt — subject, setting, lighting, and visual style — from the context above.";

export type CompilePromptInput = {
  clientContext: string;
  upstream: { label: string; text: string; type?: string }[];
  instruction: string;
};

export function compilePrompt(input: CompilePromptInput): { system: string; user: string } {
  const blocks: string[] = [];

  if (input.clientContext.trim()) {
    blocks.push(`Brand context:\n${input.clientContext.trim()}`);
  }
  for (const u of input.upstream) {
    if (!u.text.trim()) continue;
    if (u.type === "shot") {
      blocks.push(`Creating an image prompt for this specific shot:\n${u.text.trim()}`);
    } else {
      blocks.push(`${u.label}:\n${u.text.trim()}`);
    }
  }
  const instruction = input.instruction.trim() || DEFAULT_INSTRUCTION;
  blocks.push(`Instruction:\n${instruction}`);

  return { system: promptGeneratePrompt.system, user: blocks.join("\n\n") };
}
