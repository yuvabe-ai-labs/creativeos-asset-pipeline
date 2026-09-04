// Pure function: resolves @[Label](nodeId) mention tokens in an instruction string.
// Image/draw node tokens → positional "the first image" / "the second image" etc.
// (matches the positional convention OpenAI and Gemini use for multipart image messages).
// File-with-text node tokens → extracted text inline.
// Unknown nodeId → display label as plain text fallback.

export type MentionUpstream = {
  nodeId: string;
  type: string;
  text: string;
  fileUrl?: string;
  fileKind?: string;
  useLlm?: boolean;
};

// Same predicate as isVisionAttachment() in compose-message.ts — must stay in sync.
function isVisionNode(u: MentionUpstream): boolean {
  const hasUrl = typeof u.fileUrl === "string" && u.fileUrl.length > 0;
  if ((u.type === "file" || u.type === "draw") && u.fileKind === "image" && hasUrl && !u.useLlm) {
    return true;
  }
  if (u.type === "image-gen" && hasUrl) return true;
  return false;
}

export function ordinalToEnglish(n: number): string {
  const words = [
    "first", "second", "third", "fourth", "fifth",
    "sixth", "seventh", "eighth", "ninth", "tenth",
  ];
  if (n <= words.length) return `the ${words[n - 1]} image`;
  return `image ${n}`;
}

/**
 * Omni's INLINE reference token, verbatim from the vendor docs.
 *
 * `<IMAGE_REF_N>` is what goes in the prompt BODY — "in the style of <IMAGE_REF_0> a woman
 * <IMAGE_REF_1> is walking" — and it is ZERO-based over the references sub-array. `@ImageN` is a
 * different scheme that appears ONLY inside the declaration header (`[# References
 * <IMAGE_REF_0>@Image1]`), which planOmniInput owns. Writing `@ImageN` in the body, or prose like
 * "the first image", binds to nothing: the model gets a header declaring handles the text never
 * uses. Omni-specific — Veo and Kling have their own conventions and must keep the prose form.
 */
export function omniImageRefToken(n: number): string {
  return `<IMAGE_REF_${n - 1}>`;
}

const TOKEN_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

export function resolveMentionTokens(
  instruction: string,
  upstream: MentionUpstream[],
  /**
   * How a vision mention renders. Defaults to positional English prose, which is what the
   * multipart-image convention wants for Veo and Kling. Omni passes `omniImageRefToken`.
   */
  imageToken: (ordinal: number) => string = ordinalToEnglish,
): string {
  if (!instruction.includes("@[")) return instruction;

  // Build vision position map: nodeId → 1-based ordinal
  const visionOrder = new Map<string, number>();
  let ordinal = 0;
  for (const u of upstream) {
    if (isVisionNode(u)) {
      ordinal += 1;
      visionOrder.set(u.nodeId, ordinal);
    }
  }

  // Build nodeId → upstream lookup for text nodes
  const byId = new Map<string, MentionUpstream>(upstream.map((u) => [u.nodeId, u]));

  return instruction.replace(TOKEN_RE, (_match, label: string, nodeId: string) => {
    // Vision attachment → positional reference
    const pos = visionOrder.get(nodeId);
    if (pos !== undefined) return imageToken(pos);

    // File with extracted text → inline
    const node = byId.get(nodeId);
    if (node && node.text.trim()) return node.text.trim();

    // Fallback: display label
    return label;
  });
}
