import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { _put, _remove, _signPutUrl, getBucketName, publicUrlFor } from "./gcs";
import { resolveOwnership, type Ownership } from "./ownership";
import { DUBBING_UPLOAD_EXPIRY_MS } from "@/lib/dubbing/constants";
import { mimeToExt } from "@/lib/image-gen/utils";
import {
  IMAGE_GEN_MASK_MIME,
  IMAGE_RESULT_MIME_TYPES,
  type ImageResultUploads,
} from "@/lib/image-gen/task-payload";
import {
  pathForBrandAsset,
  pathForBrandImage,
  pathForClientLogo,
  pathForImageGen,
  pathForImageGenMask,
  pathForImageGenResult,
  pathForKBDocument,
  pathForMarketThumb,
  pathForMarketMedia,
  extForContentType,
  pathForNodeFile,
  pathForReviewAnnotation,
  pathForVideoGen,
  pathForVideoGenVoice,
  pathForDubbing,
  pathForAvatarImage,
  pathForAvatarGenerated,
  pathForScriptPanel,
  pathForScriptAsset,
  pathForScriptHouseStyle,
  pathForAvatarVoicePreview,
  pathForAvatarVoiceSample,
  pathForAvatarNamedVoiceSample,
  pathForClientReviewCut,
} from "./paths";
import type { BrandAssetCategory } from "@/lib/brand-kit/types";
import type { AvatarImageSlot } from "@/lib/avatars/schema";

export type UploadResult = { url: string; path: string };

// Result of authorizing a direct browser → GCS upload. `signedUrl` is where the
// browser PUTs the bytes; `url` is the eventual public URL of the stored object.
export type SignedUploadResult = { signedUrl: string; path: string; url: string };

async function _upload(
  path: string,
  body: Buffer | ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<UploadResult> {
  const buffer = Buffer.isBuffer(body)
    ? body
    : Buffer.from(body as ArrayBuffer);
  await _put(path, buffer, contentType);
  return { path, url: publicUrlFor(path) };
}

async function _sign(
  path: string,
  contentType: string,
): Promise<SignedUploadResult> {
  const signedUrl = await _signPutUrl(path, contentType);
  return { signedUrl, path, url: publicUrlFor(path) };
}

export async function uploadNodeFile(args: {
  nodeId: string;
  filename: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const { clientId, canvasId } = await resolveOwnership(args.nodeId);
  const path = pathForNodeFile({
    clientId,
    canvasId,
    nodeId: args.nodeId,
    filename: args.filename,
  });
  return _upload(path, args.body, args.contentType);
}

// Authorize a direct browser upload of a File node's file. Mirrors the path
// resolution of uploadNodeFile so the object lands in the same place.
export async function signNodeFileUpload(args: {
  nodeId: string;
  filename: string;
  contentType: string;
}): Promise<SignedUploadResult> {
  const { clientId, canvasId } = await resolveOwnership(args.nodeId);
  const path = pathForNodeFile({
    clientId,
    canvasId,
    nodeId: args.nodeId,
    filename: args.filename,
  });
  return _sign(path, args.contentType);
}

export async function uploadImageGen(args: {
  nodeId: string;
  ext: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const { clientId, canvasId } = await resolveOwnership(args.nodeId);
  const path = pathForImageGen({
    clientId,
    canvasId,
    nodeId: args.nodeId,
    ext: args.ext,
  });
  return _upload(path, args.body, args.contentType);
}

// D366 — an image task can wait in the queue and then take minutes on a slow model before it
// uploads; the default five-minute signature is far too short.
export const IMAGE_UPLOAD_EXPIRY_MS = 2 * 60 * 60 * 1000;

// D366 — the task has no storage credentials; the route signs its one upload up front, once per
// type a provider may return, since a signed PUT pins the Content-Type.
export async function signImageGenResultUploads(args: {
  nodeId: string;
  generationId: string;
  owner: Ownership;
}): Promise<ImageResultUploads> {
  const { clientId, canvasId } = args.owner;
  const entries = await Promise.all(
    IMAGE_RESULT_MIME_TYPES.map(async (mime) => {
      const path = pathForImageGenResult({
        clientId,
        canvasId,
        nodeId: args.nodeId,
        generationId: args.generationId,
        ext: mimeToExt(mime),
      });
      const upload = { putUrl: await _signPutUrl(path, mime, IMAGE_UPLOAD_EXPIRY_MS), url: publicUrlFor(path) };
      return [mime, upload] as const;
    }),
  );
  return Object.fromEntries(entries) as ImageResultUploads;
}

/** D366 — a painted edit mask, uploaded so the task receives a URL rather than megabytes. Masks are
 *  PNG only (the path ends in .png, and the routes refuse anything else). */
export async function uploadImageGenMask(args: {
  nodeId: string;
  generationId: string;
  base64: string;
  mime: string;
  owner: Ownership;
}): Promise<string> {
  if (args.mime !== IMAGE_GEN_MASK_MIME) throw new Error(`Edit masks must be ${IMAGE_GEN_MASK_MIME}, got ${args.mime}`);
  const { clientId, canvasId } = args.owner;
  const path = pathForImageGenMask({ clientId, canvasId, nodeId: args.nodeId, generationId: args.generationId });
  const { url } = await _upload(path, Buffer.from(args.base64, "base64"), IMAGE_GEN_MASK_MIME);
  return url;
}

/** D366 — everything an image task needs from storage, with the node's ownership resolved once:
 *  the signed result uploads and (when painted) the mask, in parallel. */
export async function prepareImageGenUploads(args: {
  nodeId: string;
  generationId: string;
  mask?: { base64: string; mime: string };
}): Promise<{ uploads: ImageResultUploads; maskUrl?: string }> {
  const owner = await resolveOwnership(args.nodeId);
  const { nodeId, generationId, mask } = args;
  const [uploads, maskUrl] = await Promise.all([
    signImageGenResultUploads({ nodeId, generationId, owner }),
    mask ? uploadImageGenMask({ nodeId, generationId, base64: mask.base64, mime: mask.mime, owner }) : undefined,
  ]);
  return maskUrl ? { uploads, maskUrl } : { uploads };
}

export async function uploadVideoGen(args: {
  nodeId: string;
  ext?: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const { clientId, canvasId } = await resolveOwnership(args.nodeId);
  const path = pathForVideoGen({
    clientId,
    canvasId,
    nodeId: args.nodeId,
    ext: args.ext,
  });
  return _upload(path, args.body, args.contentType);
}

// A generation can run up to 10 minutes (video-generate's maxDuration: 600) before the task
// uploads, plus the voice-change step's own retries (video-voice-change: maxDuration 120 x
// retry.maxAttempts 2); 5 minutes (the default) is far too short. Two hours covers that with
// margin to spare.
// D284 — signVideoGenVoiceUrls itself was removed with generate-time voice; this constant is
// kept for Task 4's signRevoicedVideoUrl, which re-voice-as-a-version-action will add.
export const VOICE_UPLOAD_EXPIRY_MS = 2 * 60 * 60 * 1000;

// D284 — the task has no GCS credentials; the voice-change route signs the one upload up front.
export async function signRevoicedVideoUrl(args: { nodeId: string; generationId: string }): Promise<{ putUrl: string; url: string }> {
  const { clientId, canvasId } = await resolveOwnership(args.nodeId);
  const path = pathForVideoGenVoice({ clientId, canvasId, nodeId: args.nodeId, generationId: args.generationId, variant: "revoiced" });
  return { putUrl: await _signPutUrl(path, "video/mp4", VOICE_UPLOAD_EXPIRY_MS), url: publicUrlFor(path) };
}

// D377 — the dubbing tasks have no GCS credentials; the routes sign their uploads up front.
async function signDubbingPut(nodeId: string, generationId: string, variant: "dubbed" | "dubbed-audio" | "lip-synced") {
  const { clientId, canvasId } = await resolveOwnership(nodeId);
  const path = pathForDubbing({ clientId, canvasId, nodeId, generationId, variant });
  const contentType = variant === "dubbed-audio" ? "audio/wav" : "video/mp4";
  return { putUrl: await _signPutUrl(path, contentType, DUBBING_UPLOAD_EXPIRY_MS), url: publicUrlFor(path) };
}

export async function signDubbingUploads(args: { nodeId: string; generationId: string }) {
  const [dubbed, dubbedAudio] = await Promise.all([
    signDubbingPut(args.nodeId, args.generationId, "dubbed"),
    signDubbingPut(args.nodeId, args.generationId, "dubbed-audio"),
  ]);
  return { dubbed, dubbedAudio };
}

export async function signLipSyncedUpload(args: { nodeId: string; generationId: string }) {
  return signDubbingPut(args.nodeId, args.generationId, "lip-synced");
}

// D379 — a preset voice's preview sample, shared by every client (path from pathForDubVoicePreview).
export async function uploadDubVoicePreview(path: string, wav: Buffer): Promise<UploadResult> {
  return _upload(path, wav, "audio/wav");
}

export async function uploadClientLogo(args: {
  clientId: string;
  filename: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const path = pathForClientLogo({
    clientId: args.clientId,
    filename: args.filename,
  });
  return _upload(path, args.body, args.contentType);
}

// Authorize a direct browser upload of a client logo.
export async function signClientLogoUpload(args: {
  clientId: string;
  filename: string;
  contentType: string;
}): Promise<SignedUploadResult> {
  const path = pathForClientLogo({
    clientId: args.clientId,
    filename: args.filename,
  });
  return _sign(path, args.contentType);
}

export async function uploadBrandImage(args: {
  clientId: string;
  imageId: string;
  filename: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const path = pathForBrandImage({
    clientId: args.clientId,
    imageId: args.imageId,
    filename: args.filename,
  });
  return _upload(path, args.body, args.contentType);
}

/**
 * An imported brand asset (D302, D304) — or its video's poster, under the same id. Takes bytes
 * rather than signing: they come from a provider CDN fetched inside the asset-import task.
 */
export async function uploadImportedBrandMedia(args: {
  clientId: string;
  imageId: string;
  filename: string;
  body: Buffer;
  contentType: string;
}): Promise<UploadResult> {
  const path = pathForBrandImage({ clientId: args.clientId, imageId: args.imageId, filename: args.filename });
  return _upload(path, args.body, args.contentType);
}

// Authorize a direct browser upload of a brand image. The imageId only
// disambiguates the storage path (the DB row gets its own id on finalize).
export async function signBrandImageUpload(args: {
  clientId: string;
  imageId: string;
  filename: string;
  contentType: string;
}): Promise<SignedUploadResult> {
  const path = pathForBrandImage({
    clientId: args.clientId,
    imageId: args.imageId,
    filename: args.filename,
  });
  return _sign(path, args.contentType);
}

export async function uploadKBDocument(args: {
  clientId: string;
  docId: string;
  filename: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const path = pathForKBDocument({
    clientId: args.clientId,
    docId: args.docId,
    filename: args.filename,
  });
  return _upload(path, args.body, args.contentType);
}

// Authorize a direct browser upload of a KB document. The docId only
// disambiguates the storage path (the DB row gets its own id on finalize).
export async function signKBDocumentUpload(args: {
  clientId: string;
  docId: string;
  filename: string;
  contentType: string;
}): Promise<SignedUploadResult> {
  const path = pathForKBDocument({
    clientId: args.clientId,
    docId: args.docId,
    filename: args.filename,
  });
  return _sign(path, args.contentType);
}

export async function signClientBrandAssetUpload(args: {
  clientId: string;
  category: BrandAssetCategory;
  assetId: string;
  filename: string;
  contentType: string;
}): Promise<SignedUploadResult> {
  const path = pathForBrandAsset({
    clientId: args.clientId,
    category: args.category,
    assetId: args.assetId,
    filename: args.filename,
  });
  return _sign(path, args.contentType);
}

export async function signAvatarImageUpload(args: {
  clientId: string;
  avatarId: string;
  slot: AvatarImageSlot;
  filename: string;
  contentType: string;
}): Promise<SignedUploadResult> {
  const path = pathForAvatarImage({
    clientId: args.clientId,
    avatarId: args.avatarId,
    slot: args.slot,
    filename: args.filename,
  });
  return _sign(path, args.contentType);
}

// Stores a generated avatar image exactly as the provider returned it (no re-encode).
export async function uploadAvatarGenerated(args: {
  clientId: string;
  avatarId: string;
  slot: AvatarImageSlot;
  ext: string;
  /** D340 — the stored name's stem ("view-left", "strip"), so parallel uploads never share one. */
  name?: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const path = pathForAvatarGenerated({
    clientId: args.clientId,
    avatarId: args.avatarId,
    slot: args.slot,
    ext: args.ext,
    name: args.name,
  });
  return _upload(path, args.body, args.contentType);
}

// D294 — the avatar-voice-preview task has no GCS credentials either; the route signs its one
// upload up front, exactly as signRevoicedVideoUrl does for a canvas voice change.
export async function signAvatarVoicePreviewUrl(args: {
  clientId: string;
  avatarId: string;
  generationId: string;
}): Promise<{ putUrl: string; url: string }> {
  const path = pathForAvatarVoicePreview(args);
  return { putUrl: await _signPutUrl(path, "video/mp4", VOICE_UPLOAD_EXPIRY_MS), url: publicUrlFor(path) };
}

// D296 — the voice reference extracted from a native preview's clip. Signed by the route
// alongside the clip's own upload, for the same reason: the task has no GCS credentials.
export async function signAvatarVoiceSampleUrl(args: {
  clientId: string;
  avatarId: string;
  generationId: string;
}): Promise<{ putUrl: string; url: string }> {
  const path = pathForAvatarVoiceSample(args);
  return { putUrl: await _signPutUrl(path, "audio/mpeg", VOICE_UPLOAD_EXPIRY_MS), url: publicUrlFor(path) };
}

// D299 — a named voice's reference audio, made in the web server (no signed upload needed).
export async function uploadAvatarNamedVoiceSample(args: {
  clientId: string;
  avatarId: string;
  voiceId: string;
  body: Buffer;
}): Promise<UploadResult> {
  return _upload(pathForAvatarNamedVoiceSample(args), args.body, "audio/mpeg");
}

// Review annotation assets (D239-D244). Ownership resolves ONCE for the whole batch —
// every asset in a decision belongs to the same node, so a per-asset resolve would be the
// same query N times. Uploads run before any DB write and the first failure throws, which
// aborts the caller's whole action (D244).
export async function uploadReviewAnnotationAssets(args: {
  nodeId: string;
  decisionId: string;
  assets: { seq: number; mask: Buffer }[];
}): Promise<{ seq: number; maskPath: string }[]> {
  if (args.assets.length === 0) return [];
  const { clientId, canvasId } = await resolveOwnership(args.nodeId);
  const pathFor = (seq: number) =>
    pathForReviewAnnotation({
      clientId,
      canvasId,
      nodeId: args.nodeId,
      decisionId: args.decisionId,
      seq,
    });

  const out: { seq: number; maskPath: string }[] = [];
  for (const a of args.assets) {
    const mask = await _upload(pathFor(a.seq), a.mask, "image/png");
    out.push({ seq: a.seq, maskPath: mask.path });
  }
  return out;
}

// The public URL of a stored object. Annotation assets are read back through this, the
// same way a generated image or video is — see reviewAnnotationUrl's callers.
export { publicUrlFor };

export function parsePathFromUrl(url: string): string | null {
  const prefix = `https://storage.googleapis.com/${getBucketName()}/`;
  if (url.startsWith(prefix)) return url.slice(prefix.length);
  return null;
}

/** True when `url` is a public URL of an object in this app's bucket. */
export function isOwnStoredUrl(url: string): boolean {
  return parsePathFromUrl(url) !== null;
}

const SUPABASE_PUBLIC_RE =
  /supabase\.co\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/;

export async function removeObject(urlOrPath: string): Promise<void> {
  const gcsPath = parsePathFromUrl(urlOrPath);
  if (gcsPath !== null) {
    await _remove(gcsPath);
    return;
  }
  if (!urlOrPath.startsWith("http")) {
    await _remove(urlOrPath);
    return;
  }
  const match = urlOrPath.match(SUPABASE_PUBLIC_RE);
  if (match) {
    const [, bucket, path] = match;
    const supabase = createServerSupabase();
    await supabase.storage.from(bucket).remove([path]);
    return;
  }
  throw new Error(`Unrecognized storage URL: ${urlOrPath}`);
}

// Re-hosted preview for a market reference (D185's bounded exception to URL-only
// storage): small, immutable per item, and what lets a board survive a deleted post.
export async function uploadMarketThumbnail(args: {
  clientId: string;
  itemId: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const ext =
    args.contentType === "image/png" ? "png" : args.contentType === "image/webp" ? "webp" : "jpg";
  const path = pathForMarketThumb({ clientId: args.clientId, itemId: args.itemId, ext });
  return _upload(path, args.body, args.contentType);
}

/**
 * Re-hosted MEDIA for a market reference (D264) — the video or full-resolution still
 * itself, the sibling of uploadMarketThumbnail.
 *
 * Note this takes the bytes rather than signing an upload URL: they come from a
 * server-side fetch of a provider CDN, so there is no browser request body and hence
 * no 4.5 MB Vercel limit to work around. The binding constraint is function DURATION,
 * which is why the only caller is a background task.
 */
export async function uploadMarketMedia(args: {
  clientId: string;
  itemId: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const path = pathForMarketMedia({
    clientId: args.clientId,
    itemId: args.itemId,
    ext: extForContentType(args.contentType),
  });
  return _upload(path, args.body, args.contentType);
}

// Authorize a direct browser → GCS upload of a Client review cut (up to 500 MB,
// far past Vercel's 4.5 MB body cap — the bytes never touch a function).
export async function signClientReviewUpload(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
  ext: string;
  contentType: string;
}): Promise<SignedUploadResult> {
  const path = pathForClientReviewCut(args);
  return _sign(path, args.contentType);
}

// D338 — one storyboard panel's bytes, stored as the provider returned them.
/** D392 — the Rough Cut Editor's finished package, saved with its download name. */
/** `fileName` is plain ASCII (packageNames, D416), so it sits in the header unescaped. */
export async function uploadEditorExport(path: string, bytes: Uint8Array, fileName: string): Promise<UploadResult> {
  await _put(path, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), "application/zip", {
    contentDisposition: `attachment; filename="${fileName}"`,
  });
  return { path, url: publicUrlFor(path) };
}

/** D417 — the editor's MP4, saved under its own name and downloaded as it. */
export async function uploadEditorRender(path: string, bytes: Uint8Array, fileName: string): Promise<UploadResult> {
  await _put(path, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), "video/mp4", {
    contentDisposition: `attachment; filename="${fileName}"`,
  });
  return { path, url: publicUrlFor(path) };
}

/** D446 — a signed URL for a product image or location plate the browser uploads itself. */
export async function signScriptAssetUpload(args: {
  clientId: string;
  scriptId: string;
  kind: "products" | "locations";
  ext: string;
  contentType: string;
}): Promise<SignedUploadResult> {
  return _sign(pathForScriptAsset(args), args.contentType);
}

/** D448 — a generated location plate, stored beside the script's other images. */
export async function uploadScriptAsset(args: {
  clientId: string;
  scriptId: string;
  kind: "products" | "locations";
  ext: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  return _upload(pathForScriptAsset(args), args.body, args.contentType);
}

/** D454 — the house style picture as a stored file, so a storyboard Composite sends a URL, never
 *  its bytes in a task payload. */
export async function uploadScriptHouseStyle(args: {
  clientId: string;
  scriptId: string;
  styleId: string;
  body: Buffer;
}): Promise<UploadResult> {
  return _upload(pathForScriptHouseStyle(args), args.body, "image/jpeg");
}

export async function uploadScriptPanel(args: {
  clientId: string;
  scriptId: string;
  shotId: string;
  ext: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const path = pathForScriptPanel({ clientId: args.clientId, scriptId: args.scriptId, shotId: args.shotId, ext: args.ext });
  return _upload(path, args.body, args.contentType);
}
