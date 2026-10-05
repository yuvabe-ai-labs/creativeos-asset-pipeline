// Starting imports (D302): one background job and one Trigger.dev run per source, all at once.
import "server-only";
import { tasks } from "@trigger.dev/sdk";
import { getClientById } from "@/lib/db/clients";
import { getBrandDetails } from "@/lib/db/brand-kit";
import { insertJob, listRecentJobs, setJobRunId, failJob, failStaleJobs } from "@/lib/jobs/db";
import { JobLockedError, type BackgroundJobRow } from "@/lib/jobs/types";
import { IMPORT_SOURCES, IMPORT_SOURCE_LABELS, type ImportSource } from "./constants";
import type { AssetImport, AssetImportInput, AssetImportResult } from "./types";
import { facebookPageUrl, instagramProfileUrl, websiteUrl } from "./utils";

type ImportJob = BackgroundJobRow<AssetImportInput, AssetImportResult>;

/** Past the task's 30-minute maxDuration with margin: a job still live by then is dead. */
const STALE_AFTER_MS = 45 * 60_000;

/** The lock that keeps one live import per client and source. */
export const assetImportLockKey = (clientId: string, source: ImportSource) =>
  `asset-import:${clientId}:${source}`;

/** What each source would scrape for this client, from what is saved today. */
export async function resolveImportTargets(clientId: string): Promise<Partial<Record<ImportSource, string>>> {
  const [client, details] = await Promise.all([getClientById(clientId), getBrandDetails(clientId)]);
  const targets: Partial<Record<ImportSource, string>> = {};
  const site = websiteUrl(client?.website_url ?? details.website);
  const ig = instagramProfileUrl(details.instagram);
  const fb = facebookPageUrl(details.facebook);
  if (site) targets.website = site;
  if (ig) targets.instagram = ig;
  if (fb) targets.facebook = fb;
  return targets;
}

/**
 * Starts an import for each requested source that has a target. Never waits for the scrape —
 * it returns as soon as the runs are queued. A source already importing is left running.
 */
export async function startAssetImports(args: {
  clientId: string;
  sources?: ImportSource[];
  userId?: string | null;
}): Promise<AssetImport[]> {
  const client = await getClientById(args.clientId);
  if (!client) throw new Error("Client not found.");
  const targets = await resolveImportTargets(args.clientId);
  const wanted = (args.sources ?? [...IMPORT_SOURCES]).filter((s) => targets[s]);
  // A dead run's job must not block a fresh start behind its lock.
  await failStaleJobs(args.clientId, "asset-import", STALE_AFTER_MS);

  await Promise.all(
    wanted.map(async (source): Promise<ImportJob | null> => {
      let job: ImportJob;
      try {
        job = await insertJob<AssetImportInput>({
          orgId: client.org_id,
          clientId: args.clientId,
          kind: "asset-import",
          input: { source, target: targets[source]! },
          lockKey: assetImportLockKey(args.clientId, source),
          phaseMessage: `Queued — ${IMPORT_SOURCE_LABELS[source]}`,
          createdBy: args.userId ?? null,
        }) as ImportJob;
      } catch (e) {
        if (e instanceof JobLockedError) return null;
        throw e;
      }
      try {
        const run = await tasks.trigger("asset-import", { jobId: job.id });
        await setJobRunId(job.id, run.id);
      } catch (e) {
        // Release the lock, or this source could never be imported again.
        await failJob(job.id, e instanceof Error ? e.message : "Could not start the import.");
      }
      return job;
    }),
  );
  return listLatestAssetImports(args.clientId);
}

/** Each source's most recent import for a client. */
export async function listLatestAssetImports(clientId: string): Promise<AssetImport[]> {
  await failStaleJobs(clientId, "asset-import", STALE_AFTER_MS);
  const jobs = await listRecentJobs<AssetImportInput, AssetImportResult>(clientId, "asset-import", 30);
  const latest = new Map<ImportSource, AssetImport>();
  for (const job of jobs) {
    const source = job.input?.source;
    if (!source || latest.has(source)) continue;
    latest.set(source, toAssetImport(job));
  }
  return IMPORT_SOURCES.flatMap((s) => (latest.has(s) ? [latest.get(s)!] : []));
}

function toAssetImport(job: ImportJob): AssetImport {
  return {
    id: job.id,
    source: job.input.source,
    target: job.input.target,
    status: job.status,
    phaseMessage: job.phase_message,
    assetCount: job.result?.assetCount ?? 0,
    error: job.error,
    createdAt: job.created_at,
    finishedAt: job.finished_at,
  };
}
