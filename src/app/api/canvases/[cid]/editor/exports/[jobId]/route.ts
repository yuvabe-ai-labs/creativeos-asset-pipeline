import { apiError, apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import type { ExportJobInput, ExportResult, ExportStatus } from "@/lib/editor/export-run";
import { getJob } from "@/lib/jobs/db";

// The export dialog polls this (D391). A job is only visible through the canvas it exports.
export async function GET(req: Request, { params }: { params: Promise<{ cid: string; jobId: string }> }) {
  const { cid, jobId } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId) =>
    withTryCatch("Couldn't read the export.", async () => {
      const job = await getJob<ExportJobInput, ExportResult>(jobId);
      if (!job || job.kind !== "editor-export" || job.input?.canvasId !== canvasId) return apiError("Export not found.", 404);
      const status: ExportStatus = { status: job.status, phase: job.phase_message, error: job.error, result: job.result };
      return apiOk(status);
    }),
  );
}
