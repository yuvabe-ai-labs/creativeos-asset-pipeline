import type { UpstreamPreview } from "@/lib/nodes/resolve-inputs";

// ── Types ─────────────────────────────────────────────────────────────────────

type TextPart = {
  type: "text";
  text: string;
};

type ImagePart = {
  type: "image_url";
  image_url: { url: string; detail: "auto" };
};

export type ContentPart = TextPart | ImagePart;

// A plain string when the message is text-only; a parts array when vision
// attachments are present. Matches the OpenAI SDK's ChatCompletionUserMessageParam.
export type UserContent = string | ContentPart[];

// ── Helpers ───────────────────────────────────────────────────────────────────

// An image upstream that should be sent via the vision API rather than as text.
// Conditions: file or draw node, image kind, public URL present, useLlm off (operator
// is not in extraction-only mode — the image itself is the intended input). A draw node's
// saved sketch qualifies the same way as an uploaded File image.
export function isVisionAttachment(u: UpstreamPreview): boolean {
  const hasImageUrl = typeof u.fileUrl === "string" && u.fileUrl.length > 0;
  // File / Draw image uploads (not in extraction-only mode).
  if ((u.type === "file" || u.type === "draw") && u.fileKind === "image" && hasImageUrl && !u.useLlm) {
    return true;
  }
  // An Image Gen still: its output IS the image. It only carries a fileUrl on the video path
  // (mapUpstreamForVideo); the image-Prompt path never sets it, so this cannot fire there.
  if (u.type === "image-gen" && hasImageUrl) return true;
  return false;
}

function toImagePart(u: UpstreamPreview): ImagePart {
  return {
    type: "image_url",
    image_url: { url: u.fileUrl!, detail: "auto" },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

// Build the user-turn content for an OpenAI chat completion.
//
// Returns a plain string when no vision attachments exist (all upstream content
// was normalised to text by getNodeOutput / compilePrompt).
//
// Returns a multi-part array when image file upstreams are present:
//   [ { type: "text", text: compiledPrompt }, { type: "image_url", ... }, … ]
//
// Document (PDF/DOCX) upstreams without extracted text are already represented
// as a "[File: name]" hint inside the compiled text block — they are not sent
// as URL parts because OpenAI's chat API cannot read arbitrary document URLs.
export function buildUserContent(
  compiledText: string,
  upstream: UpstreamPreview[],
): UserContent {
  const visionAttachments = upstream.filter(isVisionAttachment);
  if (visionAttachments.length === 0) return compiledText;

  return [
    { type: "text", text: compiledText },
    ...visionAttachments.map(toImagePart),
  ];
}

// The image URLs actually sent to the vision API for this request — the same set
// buildUserContent turns into image_url parts. Pure; used to record which
// attachments a generation consumed (model-request.ts).
export function visionAttachmentUrls(upstream: UpstreamPreview[]): string[] {
  return upstream.filter(isVisionAttachment).map((u) => u.fileUrl!);
}
