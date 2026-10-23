import { apiError, apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import type { TranscribeJobInput, TranscribeJobResult, TranscribeStatus } from "@/lib/editor/transcribe-plan";
import { RUN_STOPPED_MESSAGE } from "@/lib/editor/transcribe-recovery";
import { settleIfRunDead } from "@/lib/editor/transcribe-recovery-server";
import { getJob } from "@/lib/jobs/db";
import { JOB_LIVE_STATUSES } from "@/lib/jobs/types";

// The editor polls this while Auto captions runs (D399). A run is only visible through its canvas.
// A job still live here whose Trigger.dev run already ended without reporting (a dev worker
// rebuilt under it, a crash) is settled now: failed and refunded, so the editor stops waiting.
export async function GET(req: Request, { params }: { params: Promise<{ cid: string; jobId: string }> }) {
  const { cid, jobId } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId) =>
    withTryCatch("Couldn't read the captions run.", async () => {
      const job = await getJob<TranscribeJobInput, TranscribeJobResult>(jobId);
      if (!job || job.kind !== "editor-transcribe" || job.input?.canvasId !== canvasId) return apiError("Not found.", 404);
      if (JOB_LIVE_STATUSES.has(job.status) && (await settleIfRunDead(job))) {
        return apiOk({ status: "failed", result: null, error: RUN_STOPPED_MESSAGE } satisfies TranscribeStatus);
      }
      const status: TranscribeStatus = { status: job.status, result: job.result, error: job.error };
      return apiOk(status);
    }),
  );
}
