// The one ingest path every capture surface uses (Market page form, drawer add,
// extension POST). Contract (D185): the reference row ALWAYS saves; thumbnails are
// best-effort decoration. Only a DB failure propagates.
//
// The archive enqueue (D264) inherits that contract. It is fired from HERE rather than
// from the two routes so both surfaces get it from one place and it cannot drift
// between them — and a failure to enqueue is logged, not thrown, because the nightly
// sweep re-queues anything still `pending`.
import "server-only";
import { tasks } from "@trigger.dev/sdk";
import { addItem, updateItemThumbnail, type MoodboardItem } from "@/lib/db/moodboards";
import { uploadMarketThumbnail } from "@/lib/storage";
import { classifyUrl } from "./classify";
import { resolveThumbnailSource } from "./thumbnail";
import { THUMBNAIL_SIZE_LIMIT } from "./constants";

export async function ingestReference(args: {
  boardId: string;
  clientId: string;
  url: string;
  sourceUrl?: string;
  note?: string;
  addedBy?: string;
  fetchImpl?: typeof fetch;
}): Promise<MoodboardItem> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const kind = classifyUrl(args.url);

  // Save first — capture must not wait on (or fail with) preview work.
  const item = await addItem(args.boardId, {
    imageUrl: args.url,
    sourceUrl: args.sourceUrl,
    kind,
    note: args.note,
    addedBy: args.addedBy,
  });

  // The thumbnail stays INSIDE the request on purpose: it is what makes a freshly
  // clipped tile look finished immediately, which is what hides the archive latency.
  const thumbnailUrl = await rehostThumbnail(item.id, args.clientId, args.url, kind, fetchImpl);

  await enqueueArchive(item.id, args.clientId);

  return thumbnailUrl ? { ...item, thumbnail_url: thumbnailUrl } : item;
}

/** Returns the re-hosted thumbnail URL, or null for a degraded tile. Never throws. */
async function rehostThumbnail(
  itemId: string,
  clientId: string,
  url: string,
  kind: MoodboardItem["kind"],
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const thumbSource = await resolveThumbnailSource(url, kind, fetchImpl);
  if (!thumbSource) {
    console.log(
      `[clip] ingest kind=${kind}: no thumbnail source (every rung returned null) — degraded tile`,
    );
    return null;
  }
  console.log(`[clip] ingest kind=${kind}: thumbnail source ${thumbSource}`);

  try {
    const res = await fetchImpl(thumbSource);
    if (!res.ok) {
      console.log(`[clip] ingest: thumbnail fetch failed HTTP ${res.status} — degraded tile`);
      return null;
    }
    const contentType = res.headers.get("content-type")?.split(";")[0].trim() || "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > THUMBNAIL_SIZE_LIMIT) {
      console.log(`[clip] ingest: thumbnail rejected (${buffer.byteLength} bytes) — degraded tile`);
      return null;
    }

    const { url: hosted } = await uploadMarketThumbnail({
      clientId,
      itemId,
      body: buffer,
      contentType,
    });
    await updateItemThumbnail(itemId, hosted);
    console.log(`[clip] ingest: thumbnail re-hosted → ${hosted}`);
    return hosted;
  } catch (e) {
    console.log(
      `[clip] ingest: thumbnail step threw (${e instanceof Error ? e.message : e}) — degraded tile`,
    );
    return null; // degraded tile — by design, not an error
  }
}

/**
 * Hand the slow work to the background and return. Fire-and-forget: D185 says the row
 * always saves, and that contract extends here — a clip must not fail because the
 * task system is unreachable. A dropped enqueue is recovered by the nightly sweep,
 * which re-queues anything still `pending` (D271), so this is logged, never thrown.
 */
async function enqueueArchive(itemId: string, clientId: string): Promise<void> {
  try {
    await tasks.trigger("archive-reference", { itemId, clientId });
    console.log(`[clip] ingest: archive queued for item=${itemId}`);
  } catch (e) {
    console.log(
      `[clip] ingest: archive enqueue failed (${e instanceof Error ? e.message : e}) — sweep will retry`,
    );
  }
}
