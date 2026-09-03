import "server-only";
import { ANNOTATION_BUCKET, SIGNED_URL_TTL_SECONDS } from "./constants";
import type { AnnotationPayload } from "./payload";
import type { AnnotationRow } from "@/lib/db/annotations";

// Structural slice of the Supabase storage client — lets unit tests stub it and keeps
// this module honest about which storage calls it actually makes.
export type SupabaseStorage = {
  from(bucket: string): {
    upload(
      path: string,
      body: Buffer,
      opts?: { contentType?: string; upsert?: boolean },
    ): Promise<{ error: { message: string } | null }>;
    createSignedUrl(
      path: string,
      ttlSeconds: number,
    ): Promise<{ data: { signedUrl: string } | null; error: object | null }>;
  };
};

// Spec §5.2: {org_id}/{decision_id}/{seq}-mask.png / …-frame.png
export function annotationAssetPaths(orgId: string, decisionId: string, seq: number) {
  return {
    maskPath: `${orgId}/${decisionId}/${seq}-mask.png`,
    framePath: `${orgId}/${decisionId}/${seq}-frame.png`,
  };
}

// Upload BEFORE any DB write; the first failure throws and the whole action aborts —
// the senior's drafts are still client-side, so retry is lossless (D214).
export async function uploadAnnotationAssets(
  storage: SupabaseStorage,
  orgId: string,
  decisionId: string,
  anns: AnnotationPayload[],
): Promise<{ seq: number; maskPath: string; framePath: string | null }[]> {
  const bucket = storage.from(ANNOTATION_BUCKET);
  const out: { seq: number; maskPath: string; framePath: string | null }[] = [];
  for (const a of anns) {
    const { maskPath, framePath } = annotationAssetPaths(orgId, decisionId, a.seq);
    const maskRes = await bucket.upload(maskPath, Buffer.from(a.overlayBase64, "base64"), {
      contentType: "image/png",
    });
    if (maskRes.error) throw new Error(`Annotation upload failed: ${maskRes.error.message}`);
    let storedFramePath: string | null = null;
    if (a.frameBase64) {
      const frameRes = await bucket.upload(framePath, Buffer.from(a.frameBase64, "base64"), {
        contentType: "image/png",
      });
      if (frameRes.error) throw new Error(`Annotation upload failed: ${frameRes.error.message}`);
      storedFramePath = framePath;
    }
    out.push({ seq: a.seq, maskPath, framePath: storedFramePath });
  }
  return out;
}

// Read-side: short-lived signed URLs (private bucket). A signing failure degrades that
// one asset to null — the note still renders; the client refetches on 403/expiry.
export async function signAnnotationAssets(
  storage: SupabaseStorage,
  rows: AnnotationRow[],
): Promise<Map<string, { maskUrl: string | null; frameUrl: string | null }>> {
  const bucket = storage.from(ANNOTATION_BUCKET);
  const sign = async (path: string | null): Promise<string | null> => {
    if (!path) return null;
    const { data, error } = await bucket.createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    return error || !data ? null : data.signedUrl;
  };
  const out = new Map<string, { maskUrl: string | null; frameUrl: string | null }>();
  for (const row of rows) {
    out.set(row.id, {
      maskUrl: await sign(row.mask_path),
      frameUrl: await sign(row.frame_path),
    });
  }
  return out;
}
