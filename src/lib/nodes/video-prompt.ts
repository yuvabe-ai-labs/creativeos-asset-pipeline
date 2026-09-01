import { videoPromptGeneratePromptFor, type VideoProvider } from "@/prompts/video-prompt-generate";
import { renderVideoControls, type VideoControls } from "./video-controls";
import { resolveMentionTokens, ordinalToEnglish, type MentionUpstream } from "./resolve-mention-tokens";
import { isVisionAttachment } from "./compose-message";

export const DEFAULT_MOTION_INSTRUCTION =
  "Describe how the still should move over ~8 seconds — camera movement first, then the secondary motion already implied by the frame.";

export type CompileVideoPromptUpstream = {
  nodeId?: string;
  label: string;
  text: string;
  type?: string;
  fileUrl?: string;
  fileKind?: string;
  useLlm?: boolean;
};

export type CompileVideoPromptInput = {
  clientContext: string;
  upstream: CompileVideoPromptUpstream[];
  instruction: string;
  controls?: VideoControls;
  targetProvider?: VideoProvider; // D77: selects text-camera (veo/sora) vs external-camera (kling)
  /** D201 — a multishot shot gets the ladder prompt; a single one gets the continuous-take spine. */
  multishot?: boolean;
};

function buildCompositionBlock(upstream: CompileVideoPromptUpstream[]): string | null {
  const visionNodes = upstream.filter((u) =>
    isVisionAttachment({ type: u.type ?? "", fileUrl: u.fileUrl, fileKind: u.fileKind, useLlm: u.useLlm }),
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
    "Write a motion prompt that references these images by their positional names above.",
    "Describe camera movement and secondary motion for each referenced image.",
  ].join("\n");
}

export function compileVideoPrompt(input: CompileVideoPromptInput): {
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
      blocks.push(`Motion context for this shot:\n${u.text.trim()}`);
    } else {
      blocks.push(`${u.label}:\n${u.text.trim()}`);
    }
  }

  // Coerce any stored value (incl. stale "openai") to a supported provider. Camera is always text.
  //
  // Every member of the union must be listed. While this only knew "kling", a node targeting
  // "gemini-omni" fell through to "veo" HERE — so the system prompt actually sent to the model was
  // the Veo one even when the route had already selected the Omni ladder prompt for the version
  // record. The multishot prompt was unreachable, and the recorded promptId disagreed with the
  // prompt that was really used.
  const targetProvider: VideoProvider =
    input.targetProvider === "kling" || input.targetProvider === "gemini-omni"
      ? input.targetProvider
      : "veo";
  const multishot = input.multishot === true;

  // The global camera/speed block describes ONE continuous take. A multishot node carries a camera
  // per beat inside its ladder instead, so emitting this as well would hand the model two
  // conflicting camera instructions — and `camera` keeps whatever it held before the node was
  // switched to multishot, which the operator can no longer even see.
  const controlsBlock = input.controls && !multishot ? renderVideoControls(input.controls) : "";
  if (controlsBlock) blocks.push(controlsBlock);

  const rawInstruction = input.instruction.trim() || DEFAULT_MOTION_INSTRUCTION;

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

  return {
    system: videoPromptGeneratePromptFor({ provider: targetProvider, multishot }).system,
    user: blocks.join("\n\n"),
    effectiveInstruction,
  };
}
