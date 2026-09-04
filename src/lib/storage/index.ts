import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { _put, _remove, _signPutUrl, getBucketName, publicUrlFor } from "./gcs";
import { resolveOwnership } from "./ownership";
import {
  pathForBrandAsset,
  pathForBrandImage,
  pathForClientLogo,
  pathForImageGen,
  pathForKBDocument,
  pathForMarketThumb,
  pathForNodeFile,
  pathForReviewAnnotation,
  pathForVideoGen,
} from "./paths";
import type { BrandAssetCategory } from "@/lib/brand-kit/types";

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

// Review annotation assets (D209-D214). Ownership resolves ONCE for the whole batch —
// every asset in a decision belongs to the same node, so a per-asset resolve would be the
// same query N times. Uploads run before any DB write and the first failure throws, which
// aborts the caller's whole action (D214).
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
