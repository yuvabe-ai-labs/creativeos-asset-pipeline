// Thin client for the one Apify call the performance pipeline makes (D235).
// run-sync-get-dataset-items runs the actor and returns dataset items in one request
// (~9s for a profile in the 2026-09-03 spike; server-side cap via ?timeout=).
import type { ApifyProfileItem } from "./performance";

const ENDPOINT =
  "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?timeout=280";

export async function fetchProfileDetails(
  handle: string,
  opts: { token: string; fetchImpl?: typeof fetch },
): Promise<ApifyProfileItem | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      directUrls: [`https://www.instagram.com/${handle}/`],
      resultsType: "details",
      addParentData: false,
    }),
  });
  if (!res.ok) throw new Error(`Apify request failed: HTTP ${res.status}`);
  const items = (await res.json()) as ApifyProfileItem[];
  return items[0] ?? null;
}

// ── Media archive (D264, D268) ────────────────────────────────────────────────
// Two more one-call providers, both verified against live endpoints on 2026-09-11.
// Neither shape could be taken from the vendor docs: the Instagram actor's page does
// not document videoUrl, and the YouTube actor documents no output fields at all.

const POST_ENDPOINT =
  "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?timeout=280";
const YOUTUBE_ENDPOINT =
  "https://api.apify.com/v2/acts/streamers~youtube-video-downloader/run-sync-get-dataset-items?timeout=280";

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
 */
export async function fetchPostMedia(
  url: string,
  opts: { token: string; fetchImpl?: typeof fetch },
): Promise<{ videoUrl?: string; displayUrl?: string } | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(POST_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      directUrls: [url],
      resultsType: "posts",
      resultsLimit: 1,
      addParentData: false,
    }),
  });
  if (!res.ok) throw new Error(`Apify request failed: HTTP ${res.status}`);
  const items = (await res.json()) as ApifyPostItem[];
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
 */
export async function fetchYouTubeDownload(
  url: string,
  opts: { token: string; fetchImpl?: typeof fetch },
): Promise<string | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(YOUTUBE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      videos: [{ url }],
      preferredFormat: "mp4",
      preferredQuality: "720p",
    }),
  });
  if (!res.ok) throw new Error(`Apify request failed: HTTP ${res.status}`);
  const items = (await res.json()) as ApifyYouTubeItem[];
  return items[0]?.downloadedFileUrl ?? null;
}
