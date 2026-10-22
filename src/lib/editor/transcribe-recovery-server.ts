// The server's side of settling dead captions runs (transcribe-recovery.ts), wired to Trigger.dev
// and our tables. Used by the start route (a lock held by a dead run) and the status route (the
// editor's poll), so a run that never reported can't keep the editor "Listening…".
import "server-only";
import { runs } from "@trigger.dev/sdk";
import { refundReservation } from "@/lib/db/credit-transactions";
import { failGeneration } from "@/lib/db/generations";
import { failJob, listRecentJobs } from "@/lib/jobs/db";
import { JOB_LIVE_STATUSES, type BackgroundJobRow } from "@/lib/jobs/types";
import { settleDeadTranscribeJob } from "./transcribe-recovery";
import type { TranscribeJobInput, TranscribeJobResult } from "./transcribe-plan";

export const settleIfRunDead = (job: BackgroundJobRow<TranscribeJobInput, TranscribeJobResult>) =>
  settleDeadTranscribeJob(job, {
    retrieveRun: async (id) => ({ status: (await runs.retrieve(id)).status }),
    failJob,
    refund: refundReservation,
    failGeneration,
  });

/** The captions run holding this Editor's lock, if any. */
export async function findLiveTranscribeJob(clientId: string, nodeId: string) {
  const recent = await listRecentJobs<TranscribeJobInput, TranscribeJobResult>(clientId, "editor-transcribe", 10);
  return recent.find((j) => JOB_LIVE_STATUSES.has(j.status) && j.input?.nodeId === nodeId) ?? null;
}
