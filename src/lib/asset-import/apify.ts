// The Apify side of an import (D302). Runs are started asynchronously and polled, rather than
// run-sync like src/lib/market/apify.ts, because run-sync is capped at 300 s and a 50-post
// Facebook page or a 10-page site can legitimately take longer.
import {
  IMPORT_ACTORS,
  SOCIAL_POST_LIMIT,
  SOCIAL_WINDOW_MONTHS,
  WEBSITE_MAX_ITEMS,
  WEBSITE_MAX_PAGES,
  type ImportSource,
} from "./constants";

const API = "https://api.apify.com/v2";
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

/** The actor input for one source. Verified field by field in the 2026-10-05 benchmark. */
export function buildActorInput(source: ImportSource, target: string): Record<string, unknown> {
  const window = `${SOCIAL_WINDOW_MONTHS} months`;
  switch (source) {
    case "instagram":
      return {
        directUrls: [target],
        resultsType: "posts",
        resultsLimit: SOCIAL_POST_LIMIT,
        onlyPostsNewerThan: window,
        addParentData: false,
      };
    case "facebook":
      return { startUrls: [{ url: target }], resultsLimit: SOCIAL_POST_LIMIT, onlyPostsNewerThan: window };
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

/**
 * Runs the source's actor to completion and returns its dataset rows. A run that times out or
 * is aborted still returns whatever it wrote — partial assets beat none. Throws only when the
 * run produced nothing usable.
 */
export async function runImportActor(
  source: ImportSource,
  target: string,
  opts: { token: string; fetchImpl?: typeof fetch; deadlineMs?: number },
): Promise<unknown[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const headers = { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" };
  const deadline = Date.now() + (opts.deadlineMs ?? 12 * 60_000);

  // maxItems caps what a pay-per-result actor can bill (the website actor charges per asset).
  const maxItems = source === "website" ? `?maxItems=${WEBSITE_MAX_ITEMS}` : "";
  const startRes = await fetchImpl(`${API}/acts/${IMPORT_ACTORS[source]}/runs${maxItems}`, {
    method: "POST",
    headers,
    body: JSON.stringify(buildActorInput(source, target)),
  });
  if (!startRes.ok) throw new Error(`Apify could not start the ${source} scrape (HTTP ${startRes.status}).`);
  let run = ((await startRes.json()) as { data: RunData }).data;

  while (!TERMINAL.has(run.status)) {
    if (Date.now() > deadline) {
      // Left running it would keep crawling — and billing — after we have stopped listening.
      await fetchImpl(`${API}/actor-runs/${run.id}/abort`, { method: "POST", headers }).catch(() => {});
      break;
    }
    // waitForFinish holds the request open up to 60 s, so this loop is a handful of calls.
    const res = await fetchImpl(`${API}/actor-runs/${run.id}?waitForFinish=60`, { headers });
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
