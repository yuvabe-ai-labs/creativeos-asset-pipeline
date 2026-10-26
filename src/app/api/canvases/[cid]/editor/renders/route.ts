import { tasks } from "@trigger.dev/sdk";
import * as z from "zod";
import { apiError, apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import { planSavedReel } from "@/lib/editor/plan-saved-reel";
import type { RenderJobInput } from "@/lib/editor/render-run";
import { failJob, failStaleJobs, insertJob, setJobRunId } from "@/lib/jobs/db";
import { JobLockedError } from "@/lib/jobs/types";

// Starts an MP4 render (D417) of the SAVED edit, planned exactly as the Premiere export is. The
// task payload is the job id only (rule 8); the plan and the options travel in the job's input.
// One render per Editor at a time; it can run beside a Premiere export.

const STALE_RENDER_MS = 20 * 60 * 1000;
const BodySchema = z.object({ nodeId: z.uuid(), quality: z.enum(["full", "quick"]), captions: z.boolean() });

export async function POST(req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId, canvas) =>
    withTryCatch("Couldn't start the video.", async () => {
      const parsed = BodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Choose a quality for the video.", 400);
      const { nodeId, quality, captions } = parsed.data;

      const reel = await planSavedReel(canvas, nodeId);
      if (!reel.ok) return apiError(reel.reason, reel.status);

      const clientId = canvas.client_id;
      await failStaleJobs(clientId, "editor-render", STALE_RENDER_MS);
      let jobId: string;
      try {
        const input: RenderJobInput = { canvasId, nodeId, clientId, plan: reel.plan, options: { quality, captions } };
        const job = await insertJob({ orgId: reel.orgId, clientId, kind: "editor-render", input, lockKey: `editor-render:${nodeId}`, phaseMessage: "Queued…" });
        jobId = job.id;
      } catch (err) {
        if (err instanceof JobLockedError) return apiError("A video of this reel is already rendering.", 409);
        throw err;
      }

      try {
        const run = await tasks.trigger("editor-render", { jobId });
        await setJobRunId(jobId, run.id);
      } catch {
        await failJob(jobId, "Couldn't start the video. Try again.");
        return apiError("Couldn't start the video. Try again.", 502);
      }
      return apiOk({ jobId }, 202);
    }),
  );
}
