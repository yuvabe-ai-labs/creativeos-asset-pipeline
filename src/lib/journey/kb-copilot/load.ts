import "server-only";
import type { ImportSource } from "@/lib/asset-import/constants";
import { getBrandDetails } from "@/lib/db/brand-kit";
import { listBrandImages, listKBDocuments, listUnreviewedFields } from "@/lib/db/kb";
import { getLatestKBJob } from "@/lib/db/kb-jobs";
import type { ClientRow } from "@/lib/db/types";
import { listRecentJobs } from "@/lib/jobs/db";
import { JOB_LIVE_STATUSES } from "@/lib/jobs/types";
import { KB_JOB_NON_TERMINAL_STATUSES, WEBSITE_RESEARCH_FILENAME } from "@/lib/kb/constants";
import type { Attachment } from "@/lib/journey/thread/schema";
import type { KbContext } from "./context";

/** A job that has not reported for this long is not running, whatever its row says: its run died.
 *  Longer than any of these tasks may take. Read in memory, so the polled read never writes. */
export const KB_STALE_AFTER_MS = 45 * 60_000;

/** Enough recent collection jobs to find each of the three sources' latest. */
const IMPORT_JOBS_READ = 12;

const NON_TERMINAL: readonly string[] = KB_JOB_NON_TERMINAL_STATUSES;

/** What the brand KB copilot knows about a client, plus the client's own sources by id, as the
 *  server holds them (a message's attachment is stored from these, never from what the browser
 *  sent). The caller has already resolved and authorised `client`.
 *
 *  The panel polls this, so it is kept lean: six small reads in parallel, no writes, no counts. It
 *  reads job rows directly; marking a dead job failed is left to the screens that own those jobs.
 *  A built KB in review adds a seventh: which fields are still unreviewed, as paths only, never the
 *  KB's content. If that read fails the whole read fails: unknown must never look like none left. */
export async function loadKbContext(client: ClientRow, now: number = Date.now()): Promise<{ ctx: KbContext; sources: Map<string, Attachment> }> {
  const reviewing = client.kb_status === "in_review" && client.active_kb_version_id !== null;
  const [documents, images, job, details, importJobs, studyJobs, unreviewed] = await Promise.all([
    listKBDocuments(client.id),
    listBrandImages(client.id, "uploads"),
    getLatestKBJob(client.id),
    getBrandDetails(client.id),
    listRecentJobs<{ source?: ImportSource }>(client.id, "asset-import", IMPORT_JOBS_READ),
    listRecentJobs(client.id, "image-analysis", 1),
    reviewing ? listUnreviewedFields(client.active_kb_version_id as string) : Promise.resolve(null),
  ]);
  const reporting = (updatedAt: string) => now - Date.parse(updatedAt) < KB_STALE_AFTER_MS;
  const live = (j: { status: string; updated_at: string }) => JOB_LIVE_STATUSES.has(j.status as never) && reporting(j.updated_at);

  // Newest first, so the first row seen for a source is its latest collection.
  const latestImport = new Map<ImportSource, (typeof importJobs)[number]>();
  for (const j of importJobs) {
    const source = j.input?.source;
    if (source && !latestImport.has(source)) latestImport.set(source, j);
  }
  const latest = [...latestImport.entries()];
  const study = studyJobs[0];
  // A build whose run died must not look like a build in progress for ever.
  const building = job !== null && NON_TERMINAL.includes(job.status);
  const deadBuild = building && !reporting(job.updated_at);

  // The website research is written by the build, so it is not one of the person's documents.
  const uploaded = documents.filter((d) => d.filename !== WEBSITE_RESEARCH_FILENAME);
  const ctx: KbContext = {
    clientName: client.name,
    clientSlug: client.slug,
    unreviewed,
    kbStatus: client.kb_status,
    // On the client row already: the KB's content is never downloaded to learn that it exists.
    hasVersion: client.active_kb_version_id !== null,
    websiteUrl: client.website_url,
    instagram: details.instagram?.trim() || null,
    facebook: details.facebook?.trim() || null,
    documentCount: uploaded.length,
    imageCount: images.length,
    job: job && !deadBuild ? { status: job.status, phaseMessage: job.phase_message } : null,
    importing: latest.filter(([, j]) => live(j)).map(([source]) => source),
    importFailed: latest.filter(([, j]) => j.status === "failed").map(([source]) => source),
    importedBefore: latest.map(([source]) => source),
    studyingImages: study !== undefined && live(study),
    studyFailed: study?.status === "failed",
  };

  const sources = new Map<string, Attachment>();
  for (const d of documents) sources.set(d.id, { kind: "document", id: d.id, name: d.filename, url: null });
  for (const i of images) sources.set(i.id, { kind: "image", id: i.id, name: i.filename, url: i.storage_url });
  return { ctx, sources };
}
