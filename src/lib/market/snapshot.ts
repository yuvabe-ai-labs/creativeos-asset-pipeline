// The one snapshot path both callers use (daily trigger sweep + manual refresh route),
// mirroring ingestReference's contract: the SNAPSHOT always saves; thumbnails are
// best-effort decoration (D185's spirit). Only a DB/provider failure propagates.
import "server-only";
import { getBrandDetails } from "@/lib/db/brand-kit";
import {
  insertAccountSnapshot,
  upsertTrackedPost,
  updateTrackedPostThumbnail,
} from "@/lib/db/performance";
import { uploadMarketThumbnail } from "@/lib/storage";
import { THUMBNAIL_SIZE_LIMIT } from "./constants";
import { fetchProfileDetails } from "./apify";
import { parseInstagramHandle, normalizeProfileItem } from "./performance";

export type SnapshotResult =
  | { ok: true; handle: string; postCount: number }
  | { ok: false; reason: "no-handle" | "no-data" };

export async function snapshotClientHandle(
  clientId: string,
  opts?: { fetchImpl?: typeof fetch },
): Promise<SnapshotResult> {
  const fetchImpl = opts?.fetchImpl ?? fetch;

  const details = await getBrandDetails(clientId);
  const handle = parseInstagramHandle(details.instagram);
  if (!handle) return { ok: false, reason: "no-handle" };

  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("Missing APIFY_TOKEN env var");

  const item = await fetchProfileDetails(handle, { token, fetchImpl });
  if (!item) return { ok: false, reason: "no-data" };

  const { snapshot, posts } = normalizeProfileItem(item);
  await insertAccountSnapshot(clientId, snapshot);

  for (const post of posts) {
    const row = await upsertTrackedPost(clientId, handle, post);
    // Re-host once per post ever: displayUrl is a short-lived CDN link, GCS is not.
    if (row.thumbnail_url || !post.displayUrl) continue;
    try {
      const res = await fetchImpl(post.displayUrl);
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type")?.split(";")[0].trim() || "image/jpeg";
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.byteLength === 0 || buffer.byteLength > THUMBNAIL_SIZE_LIMIT) continue;
      const { url } = await uploadMarketThumbnail({
        clientId,
        itemId: row.id,
        body: buffer,
        contentType,
      });
      await updateTrackedPostThumbnail(row.id, url);
    } catch {
      // Degraded tile by design — never fail the snapshot on preview problems.
    }
  }

  return { ok: true, handle, postCount: posts.length };
}
