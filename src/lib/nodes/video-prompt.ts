// The Video Prompt node's `compile` step — pure: (client context + upstream outputs +
// instruction + controls) → the model payload. The `user` string is the visible "final
// compiled prompt" the PRD requires be shown before generation (D3). Mirrors prompt.ts.
import { videoPromptGeneratePrompt } from "@/prompts/video-prompt-generate";
import { renderVideoControls, type VideoControls } from "./video-controls";

// Sent when the operator leaves the Inline box blank. Exported so the focus view can show
// the exact sentence the model will receive.
export const DEFAULT_MOTION_INSTRUCTION =
  "Describe how the still should move over ~8 seconds — camera movement first, then the secondary motion already implied by the frame.";

export type CompileVideoPromptInput = {
  clientContext: string;
  upstream: { label: string; text: string; type?: string }[];
  instruction: string;
  controls?: VideoControls;
};

export function compileVideoPrompt(input: CompileVideoPromptInput): { system: string; user: string } {
  const blocks: string[] = [];

  if (input.clientContext.trim()) {
    blocks.push(`Brand context:\n${input.clientContext.trim()}`);
  }
  for (const u of input.upstream) {
    if (!u.text.trim()) continue;
    if (u.type === "shot") {
      blocks.push(`Motion context for this shot:\n${u.text.trim()}`);
    } else {
      blocks.push(`${u.label}:\n${u.text.trim()}`);
    }
  }

  const controlsBlock = input.controls ? renderVideoControls(input.controls) : "";
  if (controlsBlock) blocks.push(controlsBlock);

  const instruction = input.instruction.trim() || DEFAULT_MOTION_INSTRUCTION;
  blocks.push(`Instruction:\n${instruction}`);

  return { system: videoPromptGeneratePrompt.system, user: blocks.join("\n\n") };
}
