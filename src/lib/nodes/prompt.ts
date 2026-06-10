// The Prompt node's `compile` step — pure: (client context + upstream outputs +
// instruction) → the model payload. The `user` string is the visible "final
// compiled prompt" the PRD requires be shown before generation (ADR D3).
import { promptGeneratePrompt } from "@/prompts/prompt-generate";

export type CompilePromptInput = {
  clientContext: string;
  upstream: { label: string; text: string }[];
  instruction: string;
};

export function compilePrompt(input: CompilePromptInput): { system: string; user: string } {
  const blocks: string[] = [];

  if (input.clientContext.trim()) {
    blocks.push(`Brand context:\n${input.clientContext.trim()}`);
  }
  for (const u of input.upstream) {
    if (u.text.trim()) blocks.push(`${u.label}:\n${u.text.trim()}`);
  }
  const instruction =
    input.instruction.trim() || "Write an image-generation prompt from the material above.";
  blocks.push(`Instruction:\n${instruction}`);

  return { system: promptGeneratePrompt.system, user: blocks.join("\n\n") };
}
