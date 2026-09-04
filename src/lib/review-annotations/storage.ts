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
// This module owns the annotation-shaped concerns: decoding the client's base64 and
// turning stored paths back into URLs. The storage mechanics (ownership, paths, PUT)
// stay in lib/storage.
//
// D219: one asset per annotation — the painted overlay. Video annotations used to carry a
// captured still too, which is what broke them: a full-res frame exceeds the Server
// Action body limit on its own. The reader seeks to timecode_ms instead.

// Upload BEFORE any DB write; the first failure throws and the whole action aborts —
// the senior's drafts are still client-side, so retry is lossless (D214).
export async function uploadAnnotationAssets(
  nodeId: string,
  decisionId: string,
  anns: AnnotationPayload[],
): Promise<{ seq: number; maskPath: string }[]> {
  return uploadReviewAnnotationAssets({
    nodeId,
    decisionId,
    assets: anns.map((a) => ({
      seq: a.seq,
      mask: Buffer.from(a.overlayBase64, "base64"),
    })),
  });
}

// Read-side: stored paths → public URLs, keyed by annotation id. Pure — no round trip per
// asset, unlike the signed-URL scheme this replaces, so a decision with 20 annotations
// costs the versions route nothing.
export function annotationAssetUrls(rows: AnnotationRow[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const row of rows) {
    out.set(row.id, row.mask_path ? publicUrlFor(row.mask_path) : null);
  }
  return out;
}
