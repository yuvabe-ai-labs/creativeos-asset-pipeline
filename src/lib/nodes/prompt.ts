import { promptGeneratePrompt } from "@/prompts/prompt-generate";
import { renderShotControls, type ShotControls } from "./shot-controls";
import { resolveMentionTokens, ordinalToEnglish, type MentionUpstream } from "./resolve-mention-tokens";
import { isVisionAttachment } from "./compose-message";

export const DEFAULT_INSTRUCTION =
  "Write a detailed image prompt — subject, setting, lighting, and visual style — from the context above.";

export type CompilePromptUpstream = {
  nodeId?: string;
  label: string;
  text: string;
  type?: string;
  fileUrl?: string;
  fileKind?: string;
  useLlm?: boolean;
};

export type CompilePromptInput = {
  clientContext: string;
  upstream: CompilePromptUpstream[];
  instruction: string;
  controls?: ShotControls;
};

function buildCompositionBlock(upstream: CompilePromptUpstream[]): string | null {
  const visionNodes = upstream.filter((u) =>
    isVisionAttachment({
      nodeId: u.nodeId ?? "",
      versionId: null,
      label: u.label,
      type: u.type ?? "",
      text: u.text,
      fileUrl: u.fileUrl,
      fileKind: u.fileKind,
      useLlm: u.useLlm,
    } as Parameters<typeof isVisionAttachment>[0]),
  );
  if (visionNodes.length < 2) return null;

  const lines = visionNodes.map((u, i) => {
    const safeLabel = u.label.replace(/\n/g, " ").slice(0, 80);
    return `${i + 1}. ${ordinalToEnglish(i + 1)} — ${safeLabel}`;
  });

  return [
    "Reference images (attached in order):",
    ...lines,
    "",
    "Write a composition prompt that references these images by their positional names above.",
    "Describe how elements from each image combine — placement, blending, lighting match, and scale.",
  ].join("\n");
}

export function compilePrompt(input: CompilePromptInput): {
  system: string;
  user: string;
  effectiveInstruction: string;
} {
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

  const controlsBlock = input.controls ? renderShotControls(input.controls) : "";
  if (controlsBlock) blocks.push(controlsBlock);

  const rawInstruction = input.instruction.trim() || DEFAULT_INSTRUCTION;

  const mentionUpstream: MentionUpstream[] = input.upstream.map((u) => ({
    nodeId: u.nodeId ?? "",
    type: u.type ?? "",
    text: u.text,
    fileUrl: u.fileUrl,
    fileKind: u.fileKind,
    useLlm: u.useLlm,
  }));
  const effectiveInstruction = resolveMentionTokens(rawInstruction, mentionUpstream);

  if (rawInstruction.includes("@[")) {
    const compositionBlock = buildCompositionBlock(input.upstream);
    if (compositionBlock) blocks.push(compositionBlock);
  }

  blocks.push(`Instruction:\n${effectiveInstruction}`);

  return { system: promptGeneratePrompt.system, user: blocks.join("\n\n"), effectiveInstruction };
}
