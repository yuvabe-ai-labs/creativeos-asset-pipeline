// The Apify side of an import (D302). Runs are started asynchronously and polled, rather than
// run-sync, because run-sync is capped at 300 s and a 50-post Facebook page or a 10-page site can
// legitimately take longer. The market's profile snapshot shares the same flow (runApifyActor),
// because only a run reports what it cost (D560).
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
import { APIFY_MODEL_ID } from "@/lib/ai-models/text-models";
import { apifyMeters } from "@/lib/ai-models/text-usage";
import { recordProviderCost, type RecordCostInput } from "@/lib/generations/record-cost";
import type { RecordFor } from "@/lib/generations/record-for";

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

type RunData = { id: string; status: string; defaultDatasetId: string; usageTotalUsd?: number };

/** Writes one run's cost record. Defaults to awaiting recordProviderCost (a Trigger task); a
 *  request passes recordAfterResponse instead, so its response never waits for the insert. */
export type RecordApifyCost = (cost: RecordCostInput) => Promise<void> | void;

/** An earlier run, or null when Apify no longer has it (then a new run is started). */
async function readRun(runId: string, fetchImpl: typeof fetch, headers: Record<string, string>): Promise<RunData | null> {
  const res = await fetchImpl(`${API}/actor-runs/${runId}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Apify run status failed (HTTP ${res.status}).`);
  return ((await res.json()) as { data: RunData }).data;
}

/**
 * D560 — one ended run's cost: what Apify says it charged (`usageTotalUsd`), recorded once per
 * run whether it succeeded, failed or was aborted at our deadline, since each can be billed. Only the run's ids
 * and cost go in `raw`, never its dataset. A failure to record is logged, never thrown.
 */
async function recordRunCost(
  run: RunData,
  actorId: string,
  recordFor: RecordFor,
  record: RecordApifyCost,
): Promise<boolean> {
  const meters = apifyMeters(run.usageTotalUsd ?? null);
  if (!("usd" in meters)) return false;
  try {
    await record({
      ...recordFor,
      type: "scrape",
      modelId: APIFY_MODEL_ID,
      meters,
      raw: { runId: run.id, actorId, usageTotalUsd: run.usageTotalUsd },
    });
    return true;
  } catch (e) {
    console.error("[record-cost]", "scrape", APIFY_MODEL_ID, e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Starts an actor run (or continues `resumeRunId`) and waits for it to end: the one async-run
 * flow both Apify callers share (asset import, and the market's profile snapshot). Each wait is a
 * `waitForFinish` long poll of at most 60 s, capped at what is left before the deadline, so the
 * loop is a handful of calls with no timer of its own. A run still going at the deadline is
 * aborted — left running it would keep crawling, and billing, after we have stopped listening —
 * and comes back with `finished: false`. An ended run's cost, an aborted one's included, is
 * recorded for `recordFor`.
 *
 * A resumed run may already have been recorded by the attempt that started it (D483 retry):
 * `recordedRunId` names the run recorded last time, and is skipped. `onRecorded` hears each run
 * that was recorded, so the caller can keep that id for its next attempt.
 */
export async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  opts: {
    token: string;
    fetchImpl?: typeof fetch;
    deadlineMs: number;
    /** Query string for the start call, e.g. "?maxItems=80". */
    query?: string;
    startError: (status: number) => string;
    resumeRunId?: string | null;
    onStarted?: (runId: string) => Promise<void> | void;
    recordFor?: RecordFor;
    record?: RecordApifyCost;
    recordedRunId?: string | null;
    onRecorded?: (runId: string) => Promise<void> | void;
  },
): Promise<{ run: RunData; finished: boolean }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const headers = apifyHeaders(opts.token);
  const deadline = Date.now() + opts.deadlineMs;

  let run: RunData | null = opts.resumeRunId ? await readRun(opts.resumeRunId, fetchImpl, headers) : null;
  if (!run) {
    const startRes = await fetchImpl(`${API}/acts/${actorId}/runs${opts.query ?? ""}`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
    if (!startRes.ok) throw new Error(opts.startError(startRes.status));
    const started: RunData = ((await startRes.json()) as { data: RunData }).data;
    run = started;
    await opts.onStarted?.(started.id);
  }

  while (!TERMINAL.has(run.status)) {
    const left = deadline - Date.now();
    if (left <= 0) {
      // The aborted run was billed for what it crawled: record what the abort reply says it cost.
      const aborted = await abortRun(run, fetchImpl, headers);
      await recordOnce({ ...run, usageTotalUsd: aborted.usageTotalUsd ?? run.usageTotalUsd }, actorId, opts);
      return { run, finished: false };
    }
    const wait = Math.max(1, Math.min(60, Math.ceil(left / 1000)));
    const res: Response = await fetchImpl(`${API}/actor-runs/${run.id}?waitForFinish=${wait}`, { headers });
    if (!res.ok) throw new Error(`Apify run status failed (HTTP ${res.status}).`);
    run = ((await res.json()) as { data: RunData }).data;
  }

  await recordOnce(run, actorId, opts);
  return { run, finished: true };
}

/** Asks Apify to stop a run. Returns the run as the abort reply describes it, or `run` as last
 *  seen when that reply cannot be read. Never throws: the caller still reads what the run wrote. */
async function abortRun(run: RunData, fetchImpl: typeof fetch, headers: Record<string, string>): Promise<RunData> {
  try {
    const res = await fetchImpl(`${API}/actor-runs/${run.id}/abort`, { method: "POST", headers });
    if (!res.ok) return run;
    return ((await res.json()) as { data?: RunData }).data ?? run;
  } catch {
    return run;
  }
}

/** Records an ended run for `recordFor`, unless an earlier attempt already recorded it (D483). */
async function recordOnce(
  run: RunData,
  actorId: string,
  opts: { recordFor?: RecordFor; record?: RecordApifyCost; recordedRunId?: string | null; onRecorded?: (runId: string) => Promise<void> | void },
): Promise<void> {
  if (!opts.recordFor || run.id === opts.recordedRunId) return;
  const recorded = await recordRunCost(run, actorId, opts.recordFor, opts.record ?? recordProviderCost);
  if (recorded) await rememberRecorded(run.id, opts.onRecorded);
}

/** Keeping the recorded run's id is part of recording, so its failure is logged, never thrown. */
async function rememberRecorded(runId: string, onRecorded?: (runId: string) => Promise<void> | void) {
  try {
    await onRecorded?.(runId);
  } catch (e) {
    console.error("[record-cost]", "could not keep the recorded run", runId, e instanceof Error ? e.message : e);
  }
}

/** A run's dataset rows. Throws with `error(status)` when they cannot be read. */
export async function readApifyDataset(
  run: RunData,
  opts: { token: string; fetchImpl?: typeof fetch; error: (status: number) => string },
): Promise<unknown[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(`${API}/datasets/${run.defaultDatasetId}/items?format=json`, {
    headers: apifyHeaders(opts.token),
  });
  if (!res.ok) throw new Error(opts.error(res.status));
  return (await res.json()) as unknown[];
}

function apifyHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/**
 * Runs the source's actor to completion and returns its dataset rows. A run that times out or
 * is aborted still returns whatever it wrote — partial assets beat none. Throws only when the
 * run produced nothing usable.
 *
 * `resumeRunId` continues a run started by an earlier attempt instead of paying for a new scrape
 * (D483). `onStarted` hears a new run's id, so the caller can record it for that case.
 * `recordFor` names whom the run's cost is recorded for (D560); without it nothing is recorded.
 * `recordedRunId` / `onRecorded` keep a resumed run from being recorded twice (see runApifyActor).
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
    recordFor?: RecordFor;
    record?: RecordApifyCost;
    recordedRunId?: string | null;
    onRecorded?: (runId: string) => Promise<void> | void;
  },
): Promise<unknown[]> {
  const { run } = await runApifyActor(
    IMPORT_ACTORS[source],
    buildActorInput(source, target, opts.since, { latest: opts.latest }),
    {
      token: opts.token,
      fetchImpl: opts.fetchImpl,
      deadlineMs: opts.deadlineMs ?? IMPORT_SCRAPE_BUDGET_MS,
      // maxItems caps what a pay-per-result actor can bill (the website actor charges per asset).
      query: source === "website" ? `?maxItems=${WEBSITE_MAX_ITEMS}` : "",
      startError: (status) => `Apify could not start the ${source} scrape (HTTP ${status}).`,
      resumeRunId: opts.resumeRunId,
      onStarted: opts.onStarted,
      recordFor: opts.recordFor,
      record: opts.record,
      recordedRunId: opts.recordedRunId,
      onRecorded: opts.onRecorded,
    },
  );

  // A run cut off at the deadline was aborted above; whatever it wrote is still read.
  const items = await readApifyDataset(run, {
    token: opts.token,
    fetchImpl: opts.fetchImpl,
    error: (status) => `Apify results could not be read (HTTP ${status}).`,
  });
  if (run.status !== "SUCCEEDED" && items.length === 0) {
    throw new Error(`The ${source} scrape did not finish (${run.status.toLowerCase()}).`);
  }
  return items;
}
