// One source's import, end to end (D302) — called by the asset-import task.
//
// State always moves and nothing throws: the job row ends succeeded or failed with a reason the
// team can read, because the caller is a background run nobody is watching.
import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { failJob, getJob, setJobPhase, startJob, succeedJob } from "@/lib/jobs/db";
import { insertImportedBrandImage, listBrandImageRefs } from "@/lib/db/kb";
import { uploadImportedBrandMedia } from "@/lib/storage";
import { extForContentType } from "@/lib/storage/paths";
import {
  IMPORT_DOWNLOAD_CONCURRENCY,
  IMPORT_IMAGE_SIZE_LIMIT,
  IMPORT_PREVIEW_PX,
  IMPORT_SOURCE_LABELS,
  IMPORT_VIDEO_SIZE_LIMIT,
} from "./constants";
import { THUMBNAIL_SIZE_LIMIT } from "@/lib/market/constants";
import { runImportActor } from "./apify";
import { normalizeFacebook, normalizeInstagram, normalizeWebsite } from "./normalize";
import type { AssetImportInput, AssetImportResult, NormalizeResult, ScrapedAsset } from "./types";
import { importedFilename } from "./utils";

const NORMALIZERS: Record<AssetImportInput["source"], (rows: never[]) => NormalizeResult> = {
  instagram: normalizeInstagram,
  facebook: normalizeFacebook,
  website: normalizeWebsite,
};

export async function runAssetImport(
  jobId: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<AssetImportResult | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const job = await getJob<AssetImportInput, AssetImportResult>(jobId);
  if (!job || !job.client_id) return null;
  const clientId = job.client_id;
  const { source, target } = job.input;
  const label = IMPORT_SOURCE_LABELS[source];

  try {
    const token = process.env.APIFY_TOKEN;
    if (!token) throw new Error("APIFY_TOKEN is not set.");

    await startJob(jobId, `Scraping ${label}…`);
    const rows = await runImportActor(source, target, { token, fetchImpl });
    const { assets, error } = NORMALIZERS[source](rows as never[]);
    if (error) {
      await failJob(jobId, error);
      return null;
    }

    const have = await listBrandImageRefs(clientId);
    const fresh = assets.filter((a) => !have.has(a.ref));
    await setJobPhase(jobId, `Saving ${fresh.length} new from ${label}…`);

    let saved = 0;
    let failed = 0;
    await forEachLimited(fresh, IMPORT_DOWNLOAD_CONCURRENCY, async (asset) => {
      const ok = await saveAsset(clientId, asset, fetchImpl);
      if (ok === "saved") saved++;
      if (ok === "failed") failed++;
    });

    const result = { assetCount: saved, found: assets.length, failed };
    const summary = saved === 0 && assets.length > 0 ? "Already up to date" : `${saved} new`;
    await succeedJob(jobId, result, summary);
    return result;
  } catch (e) {
    await failJob(jobId, e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Downloads one asset (and a video's poster) into storage and records it. Never throws. */
async function saveAsset(
  clientId: string,
  asset: ScrapedAsset,
  fetchImpl: typeof fetch,
): Promise<"saved" | "duplicate" | "failed"> {
  try {
    const limit = asset.mediaType === "video" ? IMPORT_VIDEO_SIZE_LIMIT : IMPORT_IMAGE_SIZE_LIMIT;
    const media = await download(asset.url, limit, fetchImpl);
    if (!media) return "failed";
    // A page can label anything as an image; only real media is kept.
    if (!/^(image|video)\//.test(media.contentType)) return "failed";

    const id = randomUUID();
    const ext = extForContentType(media.contentType);
    const filename = importedFilename(asset, ext);
    const stored = await uploadImportedBrandMedia({ clientId, imageId: id, filename, body: media.body, contentType: media.contentType });

    // The grid shows a small preview, never the original: an image's own, a video's from its
    // poster. Decoration only — an asset whose preview fails is still kept.
    let thumbnailUrl: string | null = null;
    const previewSource =
      asset.mediaType === "video"
        ? asset.thumbnailUrl
          ? (await download(asset.thumbnailUrl, THUMBNAIL_SIZE_LIMIT, fetchImpl).catch(() => null))?.body
          : undefined
        : PREVIEWABLE.has(media.contentType)
          ? media.body
          : undefined;
    if (previewSource) {
      const preview = await makePreview(previewSource);
      if (preview) {
        thumbnailUrl = (
          await uploadImportedBrandMedia({ clientId, imageId: id, filename: "preview.webp", body: preview, contentType: "image/webp" })
        ).url;
      }
    }

    const row = await insertImportedBrandImage({
      id,
      clientId,
      source: asset.source,
      mediaType: asset.mediaType,
      filename,
      fileExt: ext,
      storageUrl: stored.url,
      sizeBytes: media.body.byteLength,
      thumbnailUrl,
      sourceUrl: asset.sourceUrl ?? null,
      postedAt: asset.postedAt ?? null,
      sourceRef: asset.ref,
    });
    return row ? "saved" : "duplicate";
  } catch {
    return "failed";
  }
}

/** Raster types worth a preview. An SVG is already tiny and sharp would flatten it; a GIF would
 *  lose its animation. Both are shown as they are. */
const PREVIEWABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

/** A WebP no wider or taller than IMPORT_PREVIEW_PX, or null when the bytes cannot be decoded. */
async function makePreview(body: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(body)
      .rotate() // honour EXIF orientation before the metadata is dropped
      .resize({ width: IMPORT_PREVIEW_PX, height: IMPORT_PREVIEW_PX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
  } catch {
    return null;
  }
}

async function download(
  url: string,
  limit: number,
  fetchImpl: typeof fetch,
): Promise<{ body: Buffer; contentType: string } | null> {
  const res = await fetchImpl(url);
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || "application/octet-stream";
  const body = Buffer.from(await res.arrayBuffer());
  if (body.byteLength === 0 || body.byteLength > limit) return null;
  return { body, contentType };
}

/** Runs `fn` over `items`, at most `limit` at a time. */
async function forEachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  });
  await Promise.all(workers);
}
