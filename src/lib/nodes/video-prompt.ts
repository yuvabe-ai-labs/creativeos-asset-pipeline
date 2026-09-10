import { videoPromptGeneratePromptFor, type VideoProvider } from "@/prompts/video-prompt-generate";
import { renderVideoControls, type VideoControls } from "./video-controls";
import {
  resolveMentionTokens,
  ordinalToEnglish,
  omniImageRefToken,
  seedanceImageRefToken,
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
};

export function visionUpstreams(
  upstream: CompileVideoPromptUpstream[],
): CompileVideoPromptUpstream[] {
  // `type` is optional on this shape but required by the predicate; default it so the ordering
  // stays identical to the client's, which is the whole point of sharing one filter.
  return visionAttachmentsOf(upstream.map((u) => ({ ...u, type: u.type ?? "" })));
}

type ImageRefTokenFn = (n: number) => string;

/**
 * The inline reference-token shape (if any) a target uses, plus the composition roster's own
 * trailing instruction written for that exact shape's examples.
 *
 * A boolean (`omni`) used to gate this and could only express two behaviours. There are three:
 * Veo and Kling get no inline token at all — English prose, "the first image" — because that is
 * the positional convention OpenAI/Gemini multipart-image messages already use. Gemini Omni gets
 * its own documented `<IMAGE_REF_N>` (zero-based). Seedance 2.5 gets its own `@Image N`
 * (one-based) because Seedance's OWN system prompt (video-prompt-seedance.ts) separately instructs
 * the model to write `@Image N` handles — so an operator's `@`-mention here must resolve to that
 * same shape, or the writer is told to use handles the user turn never establishes.
 *
 * `Record<VideoProvider, …>` rather than a switch: TypeScript requires every union member as a key,
 * so a fifth target added to `VideoPromptTarget` without a row here is a COMPILE error, not a
 * silent fall-through to prose or to the wrong shape — the same reasoning as the single-shot
 * prompt router's exhaustive switch (D243) and `dialectForCapability`'s (D245).
 */
type ImageRefStyle = {
  /** Inline token generator, or null when this target wants prose instead (veo, kling). */
  token: ImageRefTokenFn | null;
  /**
   * Trailing "how to place a token" instruction, naming this shape's OWN token syntax in its
   * worked examples. Exists because a bare token with no noun phrase before it makes a wrong
   * identification invisible until the finished video — the noun phrase is how it gets spotted and
   * corrected in text instead. `""` for the prose targets, which get a plain positional-reference
   * line instead (see `identifyLine` below).
   */
  usage: string;
};

const IMAGE_REF_STYLE: Record<VideoProvider, ImageRefStyle> = {
  veo: { token: null, usage: "" },
  kling: { token: null, usage: "" },
  "gemini-omni": {
    token: omniImageRefToken,
    usage:
      "Then place a token EXACTLY as written above, inline, in the beat where that thing appears. ALWAYS put a short noun phrase naming what you identified IMMEDIATELY BEFORE the token — \"the CHUPPS V-Straps <IMAGE_REF_0>\", \"a young woman <IMAGE_REF_1>\" — never the bare token on its own. That naming is how a wrong identification gets spotted and corrected in the text instead of in a finished video. Never write \"the first image\", never write @Image1, never invent a token that is not listed.",
  },
  seedance: {
    token: seedanceImageRefToken,
    // Do NOT reuse Omni's "never write @Image1" sentence here — that is precisely Seedance's OWN
    // correct token (D245), just missing the space. This paragraph instead calls out the space as
    // load-bearing and names Kling's dialect as the other wrong shape to avoid.
    usage:
      "Then place a token EXACTLY as written above, inline, in the beat where that thing appears. ALWAYS put a short noun phrase naming what you identified IMMEDIATELY BEFORE the token — \"the CHUPPS V-Straps @Image 1\", \"a young woman @Image 2\" — never the bare token on its own. That naming is how a wrong identification gets spotted and corrected in the text instead of in a finished video. Never write \"the first image\"; the space is load-bearing — \"@Image1\" with no space is wrong, and so is \"@image_1\" (Kling's dialect); never invent a token that is not listed.",
  },
};

/**
 * The reference-image roster handed to the prompt writer.
 *
 * Emitted from ONE image upward, not two. A single reference is the common case here and it still
 * needs naming: without this block the writer described the still without ever pointing at it.
 */
function buildCompositionBlock(
  upstream: CompileVideoPromptUpstream[],
  style: ImageRefStyle,
): string | null {
  const visionNodes = visionUpstreams(upstream);
  if (visionNodes.length === 0) return null;

  const lines = visionNodes.map((u, i) => {
    const safeLabel = u.label.replace(/\n/g, " ").slice(0, 80);
    const token = style.token ? style.token(i + 1) : ordinalToEnglish(i + 1);
    return `${token} — ${safeLabel}`;
  });

  const identifyLine = style.token
    ? style.usage
    : "Then reference the images the shot actually calls for, by their positional names above, in the part of the prompt where that thing appears.";

  // The "library, not a checklist" reasoning is generic to any inline-token scheme (Omni or
  // Seedance) — a scheme that declares handles at all invites citing every one of them just
  // because it exists. The prose targets have no handles to over-cite, so they get no such line.
  const scopeLine = style.token
    ? "USE ONLY THE REFERENCES THE SHOT CALLS FOR. This is a library, not a checklist: cite a reference where the shot's own content asks for it, and leave the rest out. Forcing an unrelated product into a beat in order to \"use\" it is worse than omitting it — the operator adds any others by hand."
    : "";

  return [
    "Reference images — these are ATTACHED to this message, in this order:",
    ...lines,
    "",
    // The labels are filenames ("Screenshot 2026 08 25 155453"). They identify nothing. The
    // operator should not have to annotate "this one is the v-strap" — the images are attached as
    // vision parts, so identifying each one is the model's job.
    "LOOK AT EACH ATTACHED IMAGE and identify what it actually shows — the product, garment, person or surface. The labels above are filenames and carry no meaning; ignore them for identification and use them only to keep the order straight.",
    identifyLine,
    scopeLine,
  ]
    .filter(Boolean)
    .join("\n");
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
  // prompt that was really used. This is an independent copy of the same narrowing in
  // src/app/api/nodes/[id]/video-prompt/route.ts's VALID_PROVIDERS — both must list every member.
  const targetProvider: VideoProvider =
    input.targetProvider === "kling" ||
    input.targetProvider === "gemini-omni" ||
    input.targetProvider === "seedance"
      ? input.targetProvider
      : "veo";
  // A Shot upstream is always a single continuous take (D229) — a Multishot node cannot reach
  // this route at all, so the global camera/speed block always applies here.
  const controlsBlock = input.controls ? renderVideoControls(input.controls) : "";
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
  const imageRefStyle = IMAGE_REF_STYLE[targetProvider];
  const effectiveInstruction = resolveMentionTokens(
    rawInstruction,
    mentionUpstream,
    imageRefStyle.token ?? ordinalToEnglish,
  );

  // Emitted whenever images are attached, not only when the operator typed an @-mention. The
  // roster is how the writer learns the tokens exist at all; gating it on a mention meant an
  // operator who simply connected two references got a prompt that never pointed at either.
  const compositionBlock = buildCompositionBlock(input.upstream, imageRefStyle);
  if (compositionBlock) blocks.push(compositionBlock);

  blocks.push(`Instruction:\n${effectiveInstruction}`);

  return {
    system: videoPromptGeneratePromptFor({ provider: targetProvider }).system,
    user: blocks.join("\n\n"),
    effectiveInstruction,
  };
}
