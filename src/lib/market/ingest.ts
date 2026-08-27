// The one ingest path every capture surface uses (Market page form, drawer add,
// extension POST). Contract (D185): the reference row ALWAYS saves; thumbnails are
// best-effort decoration. Only a DB failure propagates.
import "server-only";
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

  const thumbSource = await resolveThumbnailSource(args.url, kind, fetchImpl);
  if (!thumbSource) return item;

  try {
    const res = await fetchImpl(thumbSource);
    if (!res.ok) return item;
    const contentType = res.headers.get("content-type")?.split(";")[0].trim() || "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > THUMBNAIL_SIZE_LIMIT) return item;

    const { url } = await uploadMarketThumbnail({
      clientId: args.clientId,
      itemId: item.id,
      body: buffer,
      contentType,
    });
    await updateItemThumbnail(item.id, url);
    return { ...item, thumbnail_url: url };
  } catch {
    return item; // degraded tile — by design, not an error
  }
}
