// Starting image analysis and reading its status (D312).
import "server-only";
import { tasks } from "@trigger.dev/sdk";
import { getClientById } from "@/lib/db/clients";
import { countImageCoverage } from "@/lib/db/image-cards";
import { failJob, failStaleJobs, insertJob, listRecentJobs, setJobRunId } from "@/lib/jobs/db";
import { JobLockedError } from "@/lib/jobs/types";
import { IMAGE_CARD_VERSION } from "./constants";
import { imageAnalysisCopy } from "./messages";
import type { ImageAnalysisInput, ImageAnalysisResult, ImageAnalysisStatus } from "./types";
import { describeError } from "@/lib/describe-error";

/** Past the task's 30-minute maxDuration with margin: a job still live by then is dead. */
const STALE_AFTER_MS = 45 * 60_000;

const lockKey = (clientId: string) => `image-analysis:${clientId}`;

/**
 * Queues an analysis of the client's images. Returns at once. When one is already running it is
 * left to finish: it checks for added and deleted images before it ends, so it covers them.
 * `force` rewrites the section even when no image changed (the tab's Refresh).
 */
export async function startImageAnalysis(
  clientId: string,
  userId: string | null = null,
  input: ImageAnalysisInput = {},
): Promise<void> {
  const client = await getClientById(clientId);
  if (!client) return;
  await failStaleJobs(clientId, "image-analysis", STALE_AFTER_MS);

  let jobId: string;
  try {
    const job = await insertJob({
      orgId: client.org_id,
      clientId,
      kind: "image-analysis",
      input,
      lockKey: lockKey(clientId),
      phaseMessage: imageAnalysisCopy.starting,
      createdBy: userId,
    });
    jobId = job.id;
  } catch (e) {
    if (e instanceof JobLockedError) return;
    throw e;
  }
  try {
    const run = await tasks.trigger("image-analysis", { jobId });
    await setJobRunId(jobId, run.id);
  } catch (e) {
    console.error("[image-analysis] could not queue", { jobId, error: describeError(e) });
    await failJob(jobId, imageAnalysisCopy.couldNotStart); // releases the lock
  }
}

/**
 * Starts an analysis without failing the caller: uploads, imports and KB builds all trigger one,
 * and none of them should fail because analysis could not be queued.
 */
export async function startImageAnalysisQuietly(clientId: string, userId: string | null = null): Promise<void> {
  try {
    await startImageAnalysis(clientId, userId);
  } catch (e) {
    console.error("[image-analysis] start failed", { clientId, error: describeError(e) });
  }
}

export async function getImageAnalysisStatus(clientId: string): Promise<ImageAnalysisStatus> {
  await failStaleJobs(clientId, "image-analysis", STALE_AFTER_MS);
  const [coverage, jobs] = await Promise.all([
    countImageCoverage(clientId, IMAGE_CARD_VERSION),
    listRecentJobs<Record<string, never>, ImageAnalysisResult>(clientId, "image-analysis", 1),
  ]);
  const job = jobs[0];
  return {
    ...coverage,
    job: job
      ? {
          id: job.id,
          status: job.status,
          phaseMessage: job.phase_message,
          error: job.error,
          finishedAt: job.finished_at,
          result: job.result,
        }
      : null,
  };
}
