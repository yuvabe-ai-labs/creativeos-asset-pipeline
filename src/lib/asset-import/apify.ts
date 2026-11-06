// The Apify side of an import (D302). Runs are started asynchronously and polled, rather than
// run-sync like src/lib/market/apify.ts, because run-sync is capped at 300 s and a 50-post
// Facebook page or a 10-page site can legitimately take longer.
import {
  IMPORT_ACTORS,
  IMPORT_SCRAPE_BUDGET_MS,
  SOCIAL_FALLBACK_POSTS,
  SOCIAL_WINDOW_MAX_POSTS,
  SOCIAL_WINDOW_MONTHS,
  WEBSITE_MAX_ITEMS,
  WEBSITE_MAX_PAGES,
  type ImportSource,
} from "./constants";

const API = "https://api.apify.com/v2";
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

/**
 * The actor input for one source. Verified field by field in the 2026-10-05 benchmark.
 * `since` (YYYY-MM-DD) narrows a social refresh to posts after the last import, so Apify bills
 * only for new posts; both actors take an absolute date there as well as a relative one.
 *
 * Instagram and Facebook take every post in the window. `latest` is the fallback for a page with
 * nothing in the window: the newest posts, whatever their age, with no date filter at all (D467).
 */
export function buildActorInput(
  source: ImportSource,
  target: string,
  since?: string | null,
  opts: { latest?: boolean } = {},
): Record<string, unknown> {
  const window = since ?? `${SOCIAL_WINDOW_MONTHS} months`;
  switch (source) {
    case "instagram":
      if (opts.latest) {
        return { directUrls: [target], resultsType: "posts", resultsLimit: SOCIAL_FALLBACK_POSTS, addParentData: false };
      }
      return {
        directUrls: [target],
        resultsType: "posts",
        resultsLimit: SOCIAL_WINDOW_MAX_POSTS,
        onlyPostsNewerThan: window,
        addParentData: false,
      };
    case "facebook":
      if (opts.latest) return { startUrls: [{ url: target }], resultsLimit: SOCIAL_FALLBACK_POSTS };
      return { startUrls: [{ url: target }], resultsLimit: SOCIAL_WINDOW_MAX_POSTS, onlyPostsNewerThan: window };
    case "website":
      return {
        startUrls: [{ url: target }],
        crawlScope: "same-domain",
        maxPagesToCrawl: WEBSITE_MAX_PAGES,
        includeImages: true,
        includeVideo: true,
        includeAudio: false,
        includeBackgroundImages: true,
        dedupeAcrossPages: true,
        mergeResponsiveVariants: true,
      };
  }
}

type RunData = { id: string; status: string; defaultDatasetId: string };

/** An earlier run, or null when Apify no longer has it (then a new run is started). */
async function readRun(runId: string, fetchImpl: typeof fetch, headers: Record<string, string>): Promise<RunData | null> {
  const res = await fetchImpl(`${API}/actor-runs/${runId}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Apify run status failed (HTTP ${res.status}).`);
  return ((await res.json()) as { data: RunData }).data;
}

/**
 * Runs the source's actor to completion and returns its dataset rows. A run that times out or
 * is aborted still returns whatever it wrote — partial assets beat none. Throws only when the
 * run produced nothing usable.
 *
 * `resumeRunId` continues a run started by an earlier attempt instead of paying for a new scrape
 * (D483). `onStarted` hears a new run's id, so the caller can record it for that case.
 */
export async function runImportActor(
  source: ImportSource,
  target: string,
  opts: {
    token: string;
    fetchImpl?: typeof fetch;
    deadlineMs?: number;
    since?: string | null;
    latest?: boolean;
    resumeRunId?: string | null;
    onStarted?: (runId: string) => Promise<void> | void;
  },
): Promise<unknown[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const headers = { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" };
  const deadline = Date.now() + (opts.deadlineMs ?? IMPORT_SCRAPE_BUDGET_MS);

  let run: RunData | null = opts.resumeRunId ? await readRun(opts.resumeRunId, fetchImpl, headers) : null;
  if (!run) {
    // maxItems caps what a pay-per-result actor can bill (the website actor charges per asset).
    const maxItems = source === "website" ? `?maxItems=${WEBSITE_MAX_ITEMS}` : "";
    const startRes = await fetchImpl(`${API}/acts/${IMPORT_ACTORS[source]}/runs${maxItems}`, {
      method: "POST",
      headers,
      body: JSON.stringify(buildActorInput(source, target, opts.since, { latest: opts.latest })),
    });
    if (!startRes.ok) throw new Error(`Apify could not start the ${source} scrape (HTTP ${startRes.status}).`);
    const started: RunData = ((await startRes.json()) as { data: RunData }).data;
    run = started;
    await opts.onStarted?.(started.id);
  }

  while (!TERMINAL.has(run.status)) {
    if (Date.now() > deadline) {
      // Left running it would keep crawling — and billing — after we have stopped listening.
      await fetchImpl(`${API}/actor-runs/${run.id}/abort`, { method: "POST", headers }).catch(() => {});
      break;
    }
    // waitForFinish holds the request open up to 60 s, so this loop is a handful of calls.
    const res: Response = await fetchImpl(`${API}/actor-runs/${run.id}?waitForFinish=60`, { headers });
    if (!res.ok) throw new Error(`Apify run status failed (HTTP ${res.status}).`);
    run = ((await res.json()) as { data: RunData }).data;
  }

  const itemsRes = await fetchImpl(`${API}/datasets/${run.defaultDatasetId}/items?format=json`, { headers });
  if (!itemsRes.ok) throw new Error(`Apify results could not be read (HTTP ${itemsRes.status}).`);
  const items = (await itemsRes.json()) as unknown[];
  if (run.status !== "SUCCEEDED" && items.length === 0) {
    throw new Error(`The ${source} scrape did not finish (${run.status.toLowerCase()}).`);
  }
  return items;
}
