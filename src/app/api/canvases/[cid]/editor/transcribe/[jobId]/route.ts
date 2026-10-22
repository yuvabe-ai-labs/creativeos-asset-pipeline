import { apiError, apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import type { TranscribeJobInput, TranscribeJobResult, TranscribeStatus } from "@/lib/editor/transcribe-plan";
import { getJob } from "@/lib/jobs/db";

// The editor polls this while Auto captions runs (D399). A run is only visible through its canvas.
export async function GET(req: Request, { params }: { params: Promise<{ cid: string; jobId: string }> }) {
  const { cid, jobId } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId) =>
    withTryCatch("Couldn't read the captions run.", async () => {
      const job = await getJob<TranscribeJobInput, TranscribeJobResult>(jobId);
      if (!job || job.kind !== "editor-transcribe" || job.input?.canvasId !== canvasId) return apiError("Not found.", 404);
      const status: TranscribeStatus = { status: job.status, result: job.result, error: job.error };
      return apiOk(status);
    }),
  );
}
