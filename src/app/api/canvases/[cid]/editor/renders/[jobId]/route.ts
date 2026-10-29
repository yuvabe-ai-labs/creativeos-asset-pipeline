import { apiError, apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import type { RenderJobInput, RenderResult, RenderStatus } from "@/lib/editor/render-run";
import { getJob } from "@/lib/jobs/db";

// The MP4 dialog polls this (D417). A render is only visible through the canvas it renders.
export async function GET(req: Request, { params }: { params: Promise<{ cid: string; jobId: string }> }) {
  const { cid, jobId } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId) =>
    withTryCatch("Couldn't read the video.", async () => {
      const job = await getJob<RenderJobInput, RenderResult>(jobId);
      if (!job || job.kind !== "editor-render" || job.input?.canvasId !== canvasId) return apiError("Video not found.", 404);
      const status: RenderStatus = { status: job.status, phase: job.phase_message, error: job.error, result: job.result };
      return apiOk(status);
    }),
  );
}
