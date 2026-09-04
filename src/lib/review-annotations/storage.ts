import "server-only";
import {
  publicUrlFor,
  uploadReviewAnnotationAssets,
} from "@/lib/storage";
import type { AnnotationPayload } from "./payload";
import type { AnnotationRow } from "@/lib/db/annotations";

// Annotation assets live in GCS beside the image or video they mark up, through the same
// lib/storage module every other generated asset uses — not a second storage backend with
// its own bucket, lifecycle and URL shape (D217, supersedes the design's Supabase bucket).
//
// This module owns the annotation-shaped concerns: decoding the client's base64, knowing
// that a video-frame annotation has a second asset, and turning stored paths back into
// URLs. The storage mechanics (ownership, paths, PUT) stay in lib/storage.

// Upload BEFORE any DB write; the first failure throws and the whole action aborts —
// the senior's drafts are still client-side, so retry is lossless (D214).
export async function uploadAnnotationAssets(
  nodeId: string,
  decisionId: string,
  anns: AnnotationPayload[],
): Promise<{ seq: number; maskPath: string; framePath: string | null }[]> {
  return uploadReviewAnnotationAssets({
    nodeId,
    decisionId,
    assets: anns.map((a) => ({
      seq: a.seq,
      mask: Buffer.from(a.overlayBase64, "base64"),
      frame: a.frameBase64 ? Buffer.from(a.frameBase64, "base64") : null,
    })),
  });
}

// Read-side: stored paths → public URLs, keyed by annotation id. Pure — no round trip per
// asset, unlike the signed-URL scheme this replaces, so a decision with 20 annotations
// costs the versions route nothing.
export function annotationAssetUrls(
  rows: AnnotationRow[],
): Map<string, { maskUrl: string | null; frameUrl: string | null }> {
  const out = new Map<string, { maskUrl: string | null; frameUrl: string | null }>();
  for (const row of rows) {
    out.set(row.id, {
      maskUrl: row.mask_path ? publicUrlFor(row.mask_path) : null,
      frameUrl: row.frame_path ? publicUrlFor(row.frame_path) : null,
    });
  }
  return out;
}
