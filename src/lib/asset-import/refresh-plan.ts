// Where a refresh starts (D302). Shared by the import run and by the confirmation dialog's data,
// so what the dialog promises is what the run does.
import "server-only";
import { latestImportedPostAt } from "@/lib/db/kb";
import { listRecentJobs } from "@/lib/jobs/db";
import type { BackgroundJobRow } from "@/lib/jobs/types";
import type { ImportSource } from "./constants";
import type { AssetImportInput, AssetImportResult } from "./types";
import { isRefreshBase, refreshSince } from "./utils";

/**
 * The date (YYYY-MM-DD) a refresh of this source fetches posts from, or null for the whole
 * 3-month window.
 *
 * Read from what the client actually holds — the newest saved post, less a day — rather than
 * from job history: a run that failed to save, or a "no new posts" run built on one, can never
 * make a refresh skip posts that were never kept. A website has no post dates and is always
 * fetched whole; a handle that changed since the last good run starts over.
 */
export async function planRefreshSince(
  clientId: string,
  source: ImportSource,
  target: string,
  opts: { excludeJobId?: string; jobs?: BackgroundJobRow<AssetImportInput, AssetImportResult>[] } = {},
): Promise<string | null> {
  if (source === "website") return null;

  const jobs = opts.jobs ?? (await listRecentJobs<AssetImportInput, AssetImportResult>(clientId, "asset-import", 30));
  const lastGood = jobs.find(
    (j) => j.id !== opts.excludeJobId && j.input?.source === source && isRefreshBase(j.status, j.result),
  );
  if (lastGood && lastGood.input.target !== target) return null;

  return refreshSince(await latestImportedPostAt(clientId, source));
}
