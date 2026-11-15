import "server-only";
import { listLatestAssetImports } from "@/lib/asset-import/start";
import { getBrandDetails } from "@/lib/db/brand-kit";
import { listBrandImages, listKBDocuments } from "@/lib/db/kb";
import { getLatestKBJob } from "@/lib/db/kb-jobs";
import type { ClientRow } from "@/lib/db/types";
import { getImageAnalysisStatus } from "@/lib/image-analysis/start";
import { JOB_LIVE_STATUSES } from "@/lib/jobs/types";
import { WEBSITE_RESEARCH_FILENAME } from "@/lib/kb/constants";
import type { KbContext } from "./context";

/** What the brand KB copilot knows about a client, read in one round of parallel queries, plus the
 *  ids of the client's own documents and uploaded images (an attachment must be one of them).
 *  The caller has already resolved and authorised `client`; it is not read again here. */
export async function loadKbContext(client: ClientRow): Promise<{ ctx: KbContext; documentIds: Set<string>; imageIds: Set<string> }> {
  const [documents, images, job, details, imports, analysis] = await Promise.all([
    listKBDocuments(client.id),
    listBrandImages(client.id, "uploads"),
    getLatestKBJob(client.id),
    getBrandDetails(client.id),
    listLatestAssetImports(client.id),
    getImageAnalysisStatus(client.id),
  ]);
  // The website research is written by the build, so it is not one of the person's documents.
  const uploaded = documents.filter((d) => d.filename !== WEBSITE_RESEARCH_FILENAME);
  const ctx: KbContext = {
    clientName: client.name,
    kbStatus: client.kb_status,
    // On the client row already: the KB's content is never downloaded to learn that it exists.
    hasVersion: client.active_kb_version_id !== null,
    websiteUrl: client.website_url,
    instagram: details.instagram?.trim() || null,
    facebook: details.facebook?.trim() || null,
    documentCount: uploaded.length,
    imageCount: images.length,
    job: job ? { status: job.status, phaseMessage: job.phase_message } : null,
    importing: imports.filter((i) => JOB_LIVE_STATUSES.has(i.status)).map((i) => i.source),
    studyingImages: analysis.job !== null && JOB_LIVE_STATUSES.has(analysis.job.status),
  };
  return { ctx, documentIds: new Set(documents.map((d) => d.id)), imageIds: new Set(images.map((i) => i.id)) };
}
