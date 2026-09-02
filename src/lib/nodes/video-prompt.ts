import { videoPromptGeneratePromptFor, type VideoProvider } from "@/prompts/video-prompt-generate";
import { renderVideoControls, type VideoControls } from "./video-controls";
import {
  resolveMentionTokens,
  ordinalToEnglish,
  omniImageRefToken,
  type MentionUpstream,
} from "./resolve-mention-tokens";
import { visionAttachmentsOf } from "./compose-message";

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

export function visionUpstreams(
  upstream: CompileVideoPromptUpstream[],
): CompileVideoPromptUpstream[] {
  // `type` is optional on this shape but required by the predicate; default it so the ordering
  // stays identical to the client's, which is the whole point of sharing one filter.
  return visionAttachmentsOf(upstream.map((u) => ({ ...u, type: u.type ?? "" })));
}

/**
 * The reference-image roster handed to the prompt writer.
 *
 * Omni gets its documented INLINE token, `<IMAGE_REF_N>` (zero-based over the references), because
 * that is the only form the model actually binds — `planOmniInput` emits a matching
 * `[# References <IMAGE_REF_0>@Image1 …]` header at request time, and a body written in prose
 * ("the first image") leaves those declared handles referring to nothing. The vendor docs show
 * exactly this for a multishot ladder:
 *
 *     [0-3s] A studio fashion sequence. Starting with woman <IMAGE_REF_0>, she is holding <IMAGE_REF_1>
 *
 * Veo and Kling keep the positional prose form — `<IMAGE_REF_N>` is Omni syntax and would be
 * literal noise to them.
 *
 * Emitted from ONE image upward, not two. A single reference is the common case here and it still
 * needs naming: without this block the writer described the still without ever pointing at it.
 */
function buildCompositionBlock(
  upstream: CompileVideoPromptUpstream[],
  omni: boolean,
): string | null {
  const visionNodes = visionUpstreams(upstream);
  if (visionNodes.length === 0) return null;

  const lines = visionNodes.map((u, i) => {
    const safeLabel = u.label.replace(/\n/g, " ").slice(0, 80);
    const token = omni ? omniImageRefToken(i + 1) : ordinalToEnglish(i + 1);
    return `${token} — ${safeLabel}`;
  });

  return [
    "Reference images — these are ATTACHED to this message, in this order:",
    ...lines,
    "",
    // The labels are filenames ("Screenshot 2026 08 25 155453"). They identify nothing. The
    // operator should not have to annotate "this one is the v-strap" — the images are attached as
    // vision parts, so identifying each one is the model's job.
    "LOOK AT EACH ATTACHED IMAGE and identify what it actually shows — the product, garment, person or surface. The labels above are filenames and carry no meaning; ignore them for identification and use them only to keep the order straight.",
    omni
      ? "Then place each token EXACTLY as written above, inline, in the beat where that thing appears. ALWAYS put a short noun phrase naming what you identified IMMEDIATELY BEFORE the token — \"the CHUPPS V-Straps <IMAGE_REF_0>\", \"a young woman <IMAGE_REF_1>\" — never the bare token on its own. That naming is how a wrong identification gets spotted and corrected in the text instead of in a finished video. Decide for yourself which beat each reference belongs to, from what the image shows. Every reference must appear at least once. Never write \"the first image\", never write @Image1, never invent a token that is not listed."
      : "Then reference each image by its positional name above, in the part of the prompt where that thing appears, and describe camera movement and secondary motion for each.",
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
  const omni = targetProvider === "gemini-omni";
  const effectiveInstruction = resolveMentionTokens(
    rawInstruction,
    mentionUpstream,
    omni ? omniImageRefToken : ordinalToEnglish,
  );

  // Emitted whenever images are attached, not only when the operator typed an @-mention. The
  // roster is how the writer learns the tokens exist at all; gating it on a mention meant an
  // operator who simply connected two references got a prompt that never pointed at either.
  const compositionBlock = buildCompositionBlock(input.upstream, omni);
  if (compositionBlock) blocks.push(compositionBlock);

  blocks.push(`Instruction:\n${effectiveInstruction}`);

  return {
    system: videoPromptGeneratePromptFor({ provider: targetProvider, multishot }).system,
    user: blocks.join("\n\n"),
    effectiveInstruction,
  };
}
