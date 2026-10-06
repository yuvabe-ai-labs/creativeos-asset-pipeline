import type { BrandAssetCategory } from "@/lib/brand-kit/types";
import type { AvatarImageSlot } from "@/lib/avatars/schema";

const MAX_SLUG_LENGTH = 60;

export function sanitizeSlug(input: string): string {
  const stripped = input
    .toLowerCase()
    .replace(/[\\/]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_.]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, MAX_SLUG_LENGTH);
  return stripped || "untitled";
}

export function timestampSuffix(now = new Date()): string {
  const iso = now.toISOString();
  return iso.replace(/:/g, "-").replace(".", "-");
}

function splitName(filename: string): { stem: string; ext: string } {
  const idx = filename.lastIndexOf(".");
  if (idx <= 0) return { stem: filename, ext: "" };
  return {
    stem: filename.slice(0, idx),
    ext: filename.slice(idx + 1).toLowerCase(),
  };
}

export function buildStoredName(
  filename?: string,
  override?: { slug?: string; ext?: string },
): string {
  let slug: string;
  let ext: string;
  if (override?.slug !== undefined || override?.ext !== undefined) {
    slug = override.slug ?? "output";
    ext = override.ext ?? "";
  } else if (filename) {
    const parts = splitName(filename);
    slug = sanitizeSlug(parts.stem);
    ext = parts.ext;
  } else {
    slug = "output";
    ext = "";
  }
  const base = `${slug}__${timestampSuffix()}`;
  return ext ? `${base}.${ext}` : base;
}

export function pathForNodeFile(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
  filename: string;
}): string {
  const name = buildStoredName(args.filename);
  return `clients/${args.clientId}/canvases/${args.canvasId}/nodes/${args.nodeId}/files/${name}`;
}

export function pathForImageGen(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
  ext: string;
}): string {
  const name = buildStoredName(undefined, { slug: "output", ext: args.ext });
  return `clients/${args.clientId}/canvases/${args.canvasId}/nodes/${args.nodeId}/image-gen/${name}`;
}

export function pathForVideoGen(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
  ext?: string;
}): string {
  const name = buildStoredName(undefined, {
    slug: "output",
    ext: args.ext ?? "mp4",
  });
  return `clients/${args.clientId}/canvases/${args.canvasId}/nodes/${args.nodeId}/video-gen/${name}`;
}

// D282 — the original and re-voiced video of ONE generation. Keyed by generation id (not
// buildStoredName's random name) because the route signs both URLs before the task runs.
export function pathForVideoGenVoice(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
  generationId: string;
  variant: "original" | "revoiced";
}): string {
  return `clients/${args.clientId}/canvases/${args.canvasId}/nodes/${args.nodeId}/video-gen/${args.generationId}-${args.variant}.mp4`;
}

export function pathForClientLogo(args: {
  clientId: string;
  filename: string;
}): string {
  const name = buildStoredName(args.filename);
  return `clients/${args.clientId}/logo/${name}`;
}

export function pathForBrandImage(args: {
  clientId: string;
  imageId: string;
  filename: string;
}): string {
  const name = buildStoredName(args.filename);
  return `clients/${args.clientId}/brand-images/${args.imageId}/${name}`;
}

export function pathForKBDocument(args: {
  clientId: string;
  docId: string;
  filename: string;
}): string {
  const name = buildStoredName(args.filename);
  return `clients/${args.clientId}/kb-documents/${args.docId}/${name}`;
}

/**
 * Where a Brand Kit asset lives. The `assetId` is minted before signing and reused as the
 * row id at finalize, so the blob and the row always agree — and a finalize that fails
 * after a successful upload leaves an orphan that is trivially attributable.
 */
export function pathForBrandAsset(args: {
  clientId: string;
  category: BrandAssetCategory;
  assetId: string;
  filename: string;
}): string {
  const name = buildStoredName(args.filename);
  return `clients/${args.clientId}/brand-kit/${args.category}/${args.assetId}/${name}`;
}

/**
 * Where an avatar's uploaded image lives (D287). The slot is part of the path so the finalize
 * route can check that a path signed for the sheet is not recorded as the front.
 */
export function pathForAvatarImage(args: {
  clientId: string;
  avatarId: string;
  slot: AvatarImageSlot;
  filename: string;
}): string {
  const name = buildStoredName(args.filename);
  return `clients/${args.clientId}/avatars/${args.avatarId}/${args.slot}/${name}`;
}

/** An avatar's voice preview clip (D294). Keyed by generation id, not a random name, because
 *  the route signs the upload before the task that writes it runs. */
export function pathForAvatarVoicePreview(args: {
  clientId: string;
  avatarId: string;
  generationId: string;
}): string {
  return `clients/${args.clientId}/avatars/${args.avatarId}/voice-preview/${args.generationId}.mp4`;
}

/** D296 — an avatar's voice reference: the mp3 extracted from its native preview clip. Keyed by
 *  the generation that produced it, beside that clip, so the pair can always be traced to each
 *  other and a regenerated sample never collides with the one it replaces. */
export function pathForAvatarVoiceSample(args: {
  clientId: string;
  avatarId: string;
  generationId: string;
}): string {
  return `clients/${args.clientId}/avatars/${args.avatarId}/voice-sample/${args.generationId}.mp3`;
}

/** D299 — a named voice's reference for Seedance, one per avatar and voice: replacing it for the
 *  same voice overwrites, and another voice gets its own file. */
export function pathForAvatarNamedVoiceSample(args: {
  clientId: string;
  avatarId: string;
  voiceId: string;
}): string {
  const safe = args.voiceId.replace(/[^A-Za-z0-9_-]/g, "");
  return `clients/${args.clientId}/avatars/${args.avatarId}/voice-sample/elevenlabs-${safe}.mp3`;
}

/** Where a Studio-generated avatar image lives — under `generated/`, apart from uploads, so
 *  the upload finalize route's prefix check can never be satisfied by a generated object. */
export function pathForAvatarGenerated(args: {
  clientId: string;
  avatarId: string;
  slot: AvatarImageSlot;
  ext: string;
}): string {
  const name = buildStoredName(undefined, { slug: "output", ext: args.ext });
  return `clients/${args.clientId}/avatars/${args.avatarId}/generated/${args.slot}/${name}`;
}

/**
 * Where a review annotation's painted overlay lives — under the node it annotates, so the
 * mask sits beside the image or video it marks up.
 *
 * No timestamp suffix, unlike the upload paths: an annotation asset is immutable and
 * uniquely named by (decision, seq), the same reasoning as pathForMarketThumb.
 *
 * D249: video annotations store no captured still, so the mask is the only asset.
 */
export function pathForReviewAnnotation(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
  decisionId: string;
  seq: number;
}): string {
  return `clients/${args.clientId}/canvases/${args.canvasId}/nodes/${args.nodeId}/review-annotations/${args.decisionId}/${args.seq}-mask.png`;
}

export function clientReviewPrefix(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
}): string {
  return `clients/${args.clientId}/canvases/${args.canvasId}/nodes/${args.nodeId}/client-review/`;
}

// D307: the uploaded cut a client reviews. One per node; a new cut is a new node.
export function pathForClientReviewCut(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
  ext: string;
}): string {
  const name = buildStoredName(undefined, { slug: "cut", ext: args.ext });
  return `${clientReviewPrefix(args)}${name}`;
}

export function pathForMarketThumb(args: {
  clientId: string;
  itemId: string;
  ext: string;
}): string {
  return `clients/${args.clientId}/market/thumbs/${args.itemId}.${args.ext}`;
}

/**
 * The archived MEDIA for a market reference — the video or full-resolution still
 * itself, not the preview (D264).
 *
 * Deterministic per item for the same reason as pathForMarketThumb: the archive is
 * retried by the nightly sweep, and a path that varied per attempt would leave an
 * orphaned object in the bucket on every failure.
 */
export function pathForMarketMedia(args: {
  clientId: string;
  itemId: string;
  ext: string;
}): string {
  return `clients/${args.clientId}/market/media/${args.itemId}.${args.ext}`;
}

// The content types the archive actually encounters: mp4 from both providers, and
// stills for image posts and pins. Anything else still stores — losing verified bytes
// over an unrecognised header would be the wrong trade.
const MEDIA_EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  // Brand asset import (D302): website logos are often SVG, Shopify serves AVIF.
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

/** File extension for a response's content-type, tolerating `; charset=…` and casing. */
export function extForContentType(contentType: string): string {
  return MEDIA_EXT_BY_TYPE[contentType.split(";")[0].trim().toLowerCase()] ?? "bin";
}
