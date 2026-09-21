// The one archive path (D264), used by both the per-clip task and the nightly sweep.
//
// It mirrors snapshotHandle's contract rather than ingestReference's: state ALWAYS
// moves, and a provider failure is recorded rather than thrown, because the caller is
// a background job whose only useful reaction to a bad reel is to try again tomorrow.
//
// The download is deliberately plain — no Range header, no custom User-Agent. Both were
// verified unnecessary against the live CDNs, and a ranged request is rejected outright
// by Instagram's (design spec §1.1).
import "server-only";
import {
  getItem,
  claimArchive,
  completeArchive,
  failArchive,
  skipArchive,
  updateItemThumbnail,
} from "@/lib/db/moodboards";
import { uploadMarketMedia, uploadMarketThumbnail } from "@/lib/storage";
import { resolveMediaSource } from "./media";
import { MARKET_MEDIA_SIZE_LIMIT, THUMBNAIL_SIZE_LIMIT } from "./constants";

export type ArchiveResult =
  | { ok: true; bytes: number }
  | { ok: true; skipped: true }
  | { ok: true; alreadyDone: true }
  | { ok: false; reason: string };

export async function archiveItem(
  itemId: string,
  clientId: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<ArchiveResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;

  const item = await getItem(itemId);
  if (!item) return { ok: false, reason: "item not found" };

  // Idempotent by design: the ingest enqueue, the sweep and a manual retry can all
  // land on the same row, and re-downloading a file we already own is pure waste.
  if (item.archive_status === "ready") return { ok: true, alreadyDone: true };

  await claimArchive(itemId, item.archive_attempts + 1);

  try {
    const source = await resolveMediaSource(item, {
      fetchImpl,
      token: process.env.APIFY_TOKEN,
    });
    if (!source) {
      // Terminal and correct, not a failure — there is nothing here to own.
      await skipArchive(itemId);
      return { ok: true, skipped: true };
    }

    const res = await fetchImpl(source.url);
    if (!res.ok) {
      const reason = `download failed: HTTP ${res.status}`;
      await failArchive(itemId, reason);
      return { ok: false, reason };
    }

    const contentType =
      res.headers.get("content-type")?.split(";")[0].trim() ||
      source.contentType ||
      "application/octet-stream";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MARKET_MEDIA_SIZE_LIMIT) {
      const reason = `rejected size: ${buffer.byteLength} bytes`;
      await failArchive(itemId, reason);
      return { ok: false, reason };
    }

    const { url } = await uploadMarketMedia({ clientId, itemId, body: buffer, contentType });
    await completeArchive(itemId, {
      mediaUrl: url,
      mediaBytes: buffer.byteLength,
      mediaType: contentType,
    });

    // D272 — the payload that carried the media also carried the cover still, and the
    // capture-time ladder has no retry to fix the items it already failed on. This is
    // the only route by which those rows ever get a picture.
    if (!item.thumbnail_url && source.thumbnailUrl) {
      await backfillThumbnail(itemId, clientId, source.thumbnailUrl, fetchImpl);
    }

    return { ok: true, bytes: buffer.byteLength };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await failArchive(itemId, reason);
    return { ok: false, reason };
  }
}

/**
 * Best-effort preview repair. Every path swallows, because a media archive that
 * succeeded must not be reported as failed on account of its decoration — the same
 * rule ingestReference applies at capture time (D185).
 */
async function backfillThumbnail(
  itemId: string,
  clientId: string,
  thumbUrl: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  try {
    const res = await fetchImpl(thumbUrl);
    if (!res.ok) return;
    const contentType = res.headers.get("content-type")?.split(";")[0].trim() || "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > THUMBNAIL_SIZE_LIMIT) return;
    const { url } = await uploadMarketThumbnail({ clientId, itemId, body: buffer, contentType });
    await updateItemThumbnail(itemId, url);
  } catch {
    // degraded preview on an otherwise successful archive — by design, not an error
  }
}
