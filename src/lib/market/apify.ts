// Thin client for the Apify calls the performance pipeline and the media archive make (D235).
// Each call runs its actor asynchronously and polls it, through the same flow asset import uses
// (runApifyActor), because only a run reports what it cost (D537). The old run-sync calls capped
// each run at 280 s; that is still the run's timeout and our deadline.
import type { ApifyProfileItem } from "./performance";
import { readApifyDataset, runApifyActor, type RecordApifyCost } from "@/lib/asset-import/apify";
import type { RecordFor } from "@/lib/generations/record-for";

const INSTAGRAM_ACTOR = "apify~instagram-scraper";
const YOUTUBE_ACTOR = "streamers~youtube-video-downloader";
const RUN_TIMEOUT_S = 280;
const requestFailed = (status: number) => `Apify request failed: HTTP ${status}`;

type RunOpts = {
  token: string;
  fetchImpl?: typeof fetch;
  deadlineMs?: number;
  recordFor?: RecordFor;
  record?: RecordApifyCost;
};

/**
 * Runs one actor to the end and returns its dataset, with the errors the old run-sync call gave:
 * `Apify request failed: HTTP n`, and HTTP 408 (Request Timeout) for a run that outlived its wait.
 * The run's cost is recorded for `recordFor` (D537), whether it succeeded or failed.
 */
async function runToItems<T>(actorId: string, input: Record<string, unknown>, opts: RunOpts): Promise<T[]> {
  const { run, finished } = await runApifyActor(actorId, input, {
    token: opts.token,
    fetchImpl: opts.fetchImpl,
    deadlineMs: opts.deadlineMs ?? RUN_TIMEOUT_S * 1000,
    query: `?timeout=${RUN_TIMEOUT_S}`,
    startError: requestFailed,
    recordFor: opts.recordFor,
    record: opts.record,
  });
  if (!finished) throw new Error(requestFailed(408));
  if (run.status !== "SUCCEEDED") throw new Error(`Apify request failed: run ${run.status.toLowerCase()}`);
  return (await readApifyDataset(run, {
    token: opts.token,
    fetchImpl: opts.fetchImpl,
    error: requestFailed,
  })) as T[];
}

/**
 * One profile's details. `recordFor` names whom the run's cost is recorded for (D537); a request
 * passes `record: recordAfterResponse`, a Trigger task leaves the default, which awaits the insert.
 */
export async function fetchProfileDetails(handle: string, opts: RunOpts): Promise<ApifyProfileItem | null> {
  const items = await runToItems<ApifyProfileItem>(
    INSTAGRAM_ACTOR,
    {
      directUrls: [`https://www.instagram.com/${handle}/`],
      resultsType: "details",
      addParentData: false,
    },
    opts,
  );
  return items[0] ?? null;
}

// ── Media archive (D264, D268) ────────────────────────────────────────────────
// Two more one-call providers, both verified against live endpoints on 2026-09-11.
// Neither shape could be taken from the vendor docs: the Instagram actor's page does
// not document videoUrl, and the YouTube actor documents no output fields at all.

type ApifyPostItem = {
  type?: string;
  videoUrl?: string;
  displayUrl?: string;
  error?: string;
  errorDescription?: string;
};

/**
 * Media URLs for ONE Instagram permalink.
 *
 * Same actor and token as fetchProfileDetails (D235) — the difference is the
 * question: a post URL with resultsType "posts", rather than a profile with
 * "details". Verified 2026-09-11: a 17s reel returned a videoUrl serving 4.16 MB of
 * video/mp4, plus a displayUrl serving a 142 KB cover jpeg. Billing is one result.
 *
 * Callers must download the returned URL immediately — it is a signed CDN link.
 * Reached only from Trigger tasks, so the run's cost record is awaited (D537).
 */
export async function fetchPostMedia(
  url: string,
  opts: RunOpts,
): Promise<{ videoUrl?: string; displayUrl?: string } | null> {
  const items = await runToItems<ApifyPostItem>(
    INSTAGRAM_ACTOR,
    { directUrls: [url], resultsType: "posts", resultsLimit: 1, addParentData: false },
    opts,
  );
  const item = items[0];
  // A deleted or gated permalink yields a ROW carrying `error` — not an empty
  // dataset — so absence is not the only failure shape worth checking.
  if (!item || item.error) return null;
  if (!item.videoUrl && !item.displayUrl) return null;
  return { videoUrl: item.videoUrl, displayUrl: item.displayUrl };
}

type ApifyYouTubeItem = { downloadedFileUrl?: string };

/**
 * A progressive mp4 for one YouTube video or Short.
 *
 * Shorts ARE supported, which the actor's page never states — verified 2026-09-11
 * against a real Short, returning 846 KB of video/mp4 in 38s.
 *
 * Only `downloadedFileUrl` is usable. The sibling `videoOnlyUrl` / `audioOnlyUrl`
 * fields look tempting but are HLS manifests, so storing one would archive a few
 * hundred bytes of playlist instead of the video.
 *
 * The file lives in Apify's key-value store and the payload warns it expires in ~3
 * days, which is exactly why the caller downloads it immediately rather than
 * persisting the link. (Note `storeInKVStore: false` does NOT prevent this, so the
 * flag is not sent — it would only imply a guarantee the actor does not honour.)
 * Reached only from Trigger tasks, so the run's cost record is awaited (D537).
 */
export async function fetchYouTubeDownload(url: string, opts: RunOpts): Promise<string | null> {
  const items = await runToItems<ApifyYouTubeItem>(
    YOUTUBE_ACTOR,
    { videos: [{ url }], preferredFormat: "mp4", preferredQuality: "720p" },
    opts,
  );
  return items[0]?.downloadedFileUrl ?? null;
}
