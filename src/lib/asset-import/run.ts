// One source's import, end to end (D302) — called by the asset-import task.
//
// State always moves and nothing throws: the job row ends succeeded or failed with a reason the
// team can read, because the caller is a background run nobody is watching.
import "server-only";
import { randomUUID } from "node:crypto";
import { failJob, getJob, saveJobCheckpoint, setJobPhase, startJob, succeedJob } from "@/lib/jobs/db";
import { insertImportedBrandImage, listBrandImageRefs } from "@/lib/db/kb";
import { removeObject, uploadImportedBrandMedia, uploadImportedBrandMediaStream } from "@/lib/storage";
import { extForContentType } from "@/lib/storage/paths";
import {
  IMPORT_DOWNLOAD_CONCURRENCY,
  IMPORT_FALLBACK_MIN_MS,
  IMPORT_IMAGE_SIZE_LIMIT,
  IMPORT_MEMORY_LOG_EVERY,
  IMPORT_SCRAPE_BUDGET_MS,
  IMPORT_SKIPPED_LIST_MAX,
  IMPORT_VIDEO_SIZE_LIMIT,
} from "./constants";
import { THUMBNAIL_SIZE_LIMIT } from "@/lib/market/constants";
import { runImportActor } from "./apify";
import { normalizeFacebook, normalizeInstagram, normalizeWebsite } from "./normalize";
import type {
  AssetImportInput,
  AssetImportResult,
  ImportCheckpoint,
  NormalizeResult,
  ScrapedAsset,
  SkippedAsset,
} from "./types";
import { cappedStream, contentTypeOf, discardBody, MediaTooLargeError, readCapped } from "./media";
import { makeImagePreview, measureImage } from "./preview";
import { importedFilename } from "./utils";
import { planRefreshSince } from "./refresh-plan";
import { importCopy } from "./messages";
import { forEachLimited } from "@/lib/for-each-limited";
import { startImageAnalysisQuietly } from "@/lib/image-analysis/start";
import { describeError } from "@/lib/describe-error";

type Normalizer = (rows: never[], now?: Date, opts?: { windowed?: boolean }) => NormalizeResult;

const NORMALIZERS: Record<AssetImportInput["source"], Normalizer> = {
  instagram: normalizeInstagram,
  facebook: normalizeFacebook,
  website: normalizeWebsite,
};

export async function runAssetImport(
  jobId: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<AssetImportResult | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const job = await getJob<AssetImportInput, AssetImportResult & { checkpoint?: ImportCheckpoint }>(jobId);
  if (!job || !job.client_id) return null;
  // A retry of a job that has already ended (it crashed after recording its result) has nothing to do.
  if (job.status === "succeeded" || job.status === "failed") return null;
  const clientId = job.client_id;
  const { source, target } = job.input;

  // A retry after a crash (D483) picks up the Apify runs the crashed attempt started, so the
  // scrape is read again rather than paid for twice. Assets it already saved are skipped below.
  const checkpoint: ImportCheckpoint = { ...job.result?.checkpoint };
  const remember = (patch: ImportCheckpoint) => saveJobCheckpoint(jobId, Object.assign(checkpoint, patch));

  try {
    const token = process.env.APIFY_TOKEN;
    if (!token) throw new Error("APIFY_TOKEN is not set.");

    // A social refresh asks only for posts since the last import of this same target, so Apify
    // bills for what is new. A website has no post dates: it is always crawled whole.
    const since = await planRefreshSince(clientId, source, target, { excludeJobId: jobId });
    await startJob(jobId, importCopy.collecting(source, since));
    // One scrape budget for the run, fallback included, so the task always ends inside its
    // maxDuration: a task killed mid-run would leave the job "running" and the KB spinner on.
    const scrapeEnds = Date.now() + IMPORT_SCRAPE_BUDGET_MS;
    const rows = await runImportActor(source, target, {
      token,
      fetchImpl,
      since,
      deadlineMs: IMPORT_SCRAPE_BUDGET_MS,
      resumeRunId: checkpoint.windowRunId,
      onStarted: (runId) => remember({ windowRunId: runId }),
    });
    let { assets, error, errorCode } = NORMALIZERS[source](rows as never[]);

    // Social fallback (D467): a first import of a page with nothing posted in the last 3 months
    // (Apify's "no_items", or only old pinned posts that the window drops) takes the page's
    // latest posts instead, whatever their age. A refresh never does: there, nothing in range
    // just means nothing new.
    const latest = source !== "website" && !since && assets.length === 0 && (!error || errorCode === "no_items");
    if (latest) {
      // The progress line stays "Collecting the last 3 months…": the fallback is not announced.
      const deadlineMs = Math.max(scrapeEnds - Date.now(), IMPORT_FALLBACK_MIN_MS);
      const latestRows = await runImportActor(source, target, {
        token,
        fetchImpl,
        latest: true,
        deadlineMs,
        resumeRunId: checkpoint.latestRunId,
        onStarted: (runId) => remember({ latestRunId: runId }),
      });
      ({ assets, error, errorCode } = NORMALIZERS[source](latestRows as never[], new Date(), { windowed: false }));
      // Nothing at all, even without the date filter: the page has never posted. The import
      // finishes (it is not a failure), so the KB carries on with whatever else it has.
      if (errorCode === "no_items") {
        const result = { assetCount: 0, found: 0, failed: 0, since, latest: true };
        await succeedJob(jobId, result, importCopy.noPostsAtAll);
        return result;
      }
    }

    if (error) {
      // A refresh that finds nothing newer than last time has worked: there is just nothing new.
      if (since && errorCode === "no_items") {
        const result = { assetCount: 0, found: 0, failed: 0, since };
        await succeedJob(jobId, result, importCopy.nothingNew);
        return result;
      }
      await failJob(jobId, error);
      return null;
    }

    const have = await listBrandImageRefs(clientId);
    const fresh = assets.filter((a) => !have.has(a.ref));
    await setJobPhase(jobId, importCopy.adding(fresh.length));

    let saved = 0;
    let failed = 0;
    let firstFailure: string | null = null;
    const skipped: SkippedAsset[] = [];
    const memory = memoryLog(jobId, source);
    await forEachLimited(fresh, IMPORT_DOWNLOAD_CONCURRENCY, async (asset) => {
      const outcome = await saveAsset(clientId, asset, fetchImpl);
      memory.after(asset);
      if (outcome.status === "saved") saved++;
      if (outcome.status === "failed") {
        failed++;
        firstFailure ??= `${asset.ref}: ${outcome.reason}`;
        if (skipped.length < IMPORT_SKIPPED_LIST_MAX) {
          skipped.push({ ref: asset.ref, sourceUrl: asset.sourceUrl ?? null, reason: outcome.reason });
        }
      }
    });
    memory.end();

    const result = {
      assetCount: saved,
      found: assets.length,
      failed,
      since,
      ...(latest && { latest: true }),
      ...(skipped.length > 0 && { skipped }),
    };
    if (failed > 0) {
      console.error("[asset-import] assets not saved", { jobId, source, failed, of: fresh.length, first: firstFailure });
    }

    // Every new asset failing is a broken run (a missing column, storage down), not a quiet
    // "0 new": say so, and keep it from becoming the base the next refresh builds on.
    if (fresh.length > 0 && saved === 0 && failed === fresh.length) {
      await failJob(jobId, importCopy.couldNotSave(fresh.length));
      return result;
    }
    await succeedJob(jobId, result, importCopy.done(saved, assets.length, failed));
    if (saved > 0) await startImageAnalysisQuietly(clientId);
    return result;
  } catch (e) {
    // The cause (provider, HTTP status, configuration) belongs in the server logs, not on screen.
    console.error("[asset-import] failed", { jobId, source, error: describeError(e) });
    await failJob(jobId, importCopy.unavailable(source));
    return null;
  }
}

type SaveOutcome = { status: "saved" | "duplicate" } | { status: "failed"; reason: string };

/**
 * Downloads one asset (and a video's poster) into storage and records it. Never throws. Files
 * are uploaded before the row is written, so whenever no row lands (a duplicate, or a failed
 * insert) they are removed again rather than left orphaned in the bucket.
 */
async function saveAsset(clientId: string, asset: ScrapedAsset, fetchImpl: typeof fetch): Promise<SaveOutcome> {
  const uploaded: string[] = [];
  const discard = () => Promise.all(uploaded.map((url) => removeObject(url).catch(() => {})));
  try {
    const res = await fetchImpl(asset.url);
    if (!res.ok) {
      discardBody(res);
      return { status: "failed", reason: `download failed (HTTP ${res.status})` };
    }
    const contentType = contentTypeOf(res);
    // A page can label anything as an image; only real media is kept.
    if (!/^(image|video)\//.test(contentType)) {
      discardBody(res);
      return { status: "failed", reason: `not media (${contentType})` };
    }

    const id = randomUUID();
    const ext = extForContentType(contentType);
    const filename = importedFilename(asset, ext);
    // A video passes straight through to storage, so it never sits whole in memory. An image is
    // read whole, because its preview needs every pixel (D483).
    const stored = contentType.startsWith("video/")
      ? await storeStreamed(res, { clientId, imageId: id, filename, contentType })
      : await storeWhole(res, { clientId, imageId: id, filename, contentType });
    if (stored.url) uploaded.push(stored.url);
    if (stored.bytes === 0) {
      await discard();
      return { status: "failed", reason: "empty file" };
    }

    // The still that stands for the asset: the image itself, or a video's poster. It gives the
    // masonry its aspect ratio and the grid its small preview. Both are decoration — an asset
    // whose still cannot be read is still kept.
    const still =
      asset.mediaType === "video"
        ? asset.thumbnailUrl
          ? await downloadStill(asset.thumbnailUrl, fetchImpl)
          : undefined
        : stored.body;
    const size = still ? await measureImage(still) : null;

    let thumbnailUrl: string | null = null;
    const previewSource = asset.mediaType === "video" || PREVIEWABLE.has(contentType) ? still : undefined;
    if (previewSource) {
      const preview = await makeImagePreview(previewSource);
      if (preview) {
        thumbnailUrl = (
          await uploadImportedBrandMedia({ clientId, imageId: id, filename: "preview.webp", body: preview, contentType: "image/webp" })
        ).url;
        uploaded.push(thumbnailUrl);
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
      sizeBytes: stored.bytes,
      thumbnailUrl,
      sourceUrl: asset.sourceUrl ?? null,
      postedAt: asset.postedAt ?? null,
      sourceRef: asset.ref,
      width: size?.width ?? null,
      height: size?.height ?? null,
    });
    if (!row) {
      await discard(); // another source saved the same cross-post a moment earlier
      return { status: "duplicate" };
    }
    return { status: "saved" };
  } catch (e) {
    await discard();
    return { status: "failed", reason: e instanceof MediaTooLargeError ? `too large (${e.message})` : describeError(e) };
  }
}

/** Raster types worth a preview. An SVG is already tiny and sharp would flatten it; a GIF would
 *  lose its animation. Both are shown as they are. */
const PREVIEWABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

type Destination = { clientId: string; imageId: string; filename: string; contentType: string };
type Stored = { url: string; bytes: number; body?: Buffer };

/** Streams a video into storage. Stopped, and nothing kept, once it passes the video limit. */
async function storeStreamed(res: Response, to: Destination): Promise<Stored> {
  const { stream, bytes } = cappedStream(res, IMPORT_VIDEO_SIZE_LIMIT);
  const stored = await uploadImportedBrandMediaStream({ ...to, body: stream });
  return { url: stored.url, bytes: bytes() };
}

/** Reads an image whole, stopping once it passes the image limit, then stores it. */
async function storeWhole(res: Response, to: Destination): Promise<Stored> {
  const body = await readCapped(res, IMPORT_IMAGE_SIZE_LIMIT);
  if (body.byteLength === 0) return { url: "", bytes: 0 };
  const stored = await uploadImportedBrandMedia({ ...to, body });
  return { url: stored.url, bytes: body.byteLength, body };
}

/** A video's poster image, or undefined when it cannot be read. Decoration only. */
async function downloadStill(url: string, fetchImpl: typeof fetch): Promise<Buffer | undefined> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) {
      discardBody(res);
      return undefined;
    }
    const body = await readCapped(res, THUMBNAIL_SIZE_LIMIT);
    return body.byteLength > 0 ? body : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Logs the process's memory while assets are saved (D483): every IMPORT_MEMORY_LOG_EVERY assets,
 * and whenever it has grown by 25 MB since the last line. When a run is killed for memory, its
 * last lines show how far it got and how memory grew.
 */
function memoryLog(jobId: string, source: string) {
  const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));
  let count = 0;
  let peak = 0;
  let lastLogged = 0;
  return {
    after(asset: ScrapedAsset) {
      count++;
      const usage = process.memoryUsage();
      peak = Math.max(peak, usage.rss);
      if (count % IMPORT_MEMORY_LOG_EVERY !== 0 && usage.rss < lastLogged + 25 * 1024 * 1024) return;
      lastLogged = usage.rss;
      console.log("[asset-import] memory", {
        jobId,
        source,
        assets: count,
        rssMb: mb(usage.rss),
        externalMb: mb(usage.external),
        heapMb: mb(usage.heapUsed),
        lastMedia: asset.mediaType,
      });
    },
    end() {
      if (count > 0) console.log("[asset-import] memory peak", { jobId, source, assets: count, peakRssMb: mb(peak) });
    },
  };
}

