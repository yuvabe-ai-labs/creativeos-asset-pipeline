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

/**
 * Seedance 2.5's own inline handle, verbatim from the vendor docs — ONE-based over the
 * references, unlike `omniImageRefToken` which subtracts 1. Seedance's own system prompt
 * (`src/prompts/video-prompt-seedance.ts`) separately instructs the model to write `@Image N`
 * handles in the body, so the Instruction field's `@`-mentions must resolve to the same shape or
 * the writer is told to use handles the user turn never establishes.
 *
 * The capital `I` is load-bearing: Kling's own dialect writes `@image_1` (lowercase, underscore)
 * for the identical one-based scheme (D245). Do not lowercase this.
 *
 * THE SPACE IS DELIBERATE, AND THE VENDOR'S DOCS CONTRADICT THEMSELVES ABOUT IT — do not "fix" it
 * to `@Image1` on a raw grep count. A review did exactly that, counting 12 no-space hits against 3
 * spaced ones in the tutorial and concluding no-space was the demonstrated form. The counts are
 * real; the conclusion is not:
 *
 *   - Those 12 `@Image1` hits are ONE prompt string, duplicated verbatim across the tutorial's
 *     Python / JavaScript / Go / Java / REST language tabs for a single worked example.
 *   - The spaced form is what the normative "Prompt rules" section uses
 *     (`Dreamina Seedance 2.5 tutorial.md:2871`), and what both "Prompt examples:" lines use
 *     (:76, :91).
 *   - `One-take CreationFlexibleReferencing_Introducing_Seedance 2_5.md` uses the spaced form 13
 *     times across several complete R2V prompts, up to `@Image 18`, and never the no-space form.
 *
 * So the spaced form carries the authoritative guidance and the bulk of the worked prompts. It is
 * also not required by the Kling collision — `@Image1` would already be distinct from `@image_1` —
 * which is why that argument alone should not decide this either way.
 *
 * Genuinely settled only by a real generation: attach two references, cite both, and see which
 * spelling binds. Until then this follows the vendor's own stated rule.
 */
export function seedanceImageRefToken(n: number): string {
  return `@Image ${n}`;
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
