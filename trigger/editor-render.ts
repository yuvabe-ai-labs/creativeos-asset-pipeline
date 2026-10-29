// trigger/editor-render.ts
// Renders the Rough Cut Editor's reel as an MP4 (D417): downloads the reel's media, burns in the
// captions when asked, encodes, and uploads. Progress and the result go on the background_jobs row
// the MP4 dialog polls. Every @/lib import is dynamic (see editor-export.ts). One attempt: nothing
// is paid for, and a failure is shown to the user, who can try again.
import { AbortTaskRunError, logger, task } from "@trigger.dev/sdk";

const STOPPED = "The video stopped before it finished. Try again.";
const NOT_READY = "Videos with captions can't be made right now. Try again without captions, or later.";
const COULDNT_RENDER = "The video couldn't be rendered. Try again.";

export const editorRenderTask = task({
  id: "editor-render",
  // x264 is CPU-bound: two cores roughly halve a reel's render.
  machine: "medium-2x",
  maxDuration: 900,
  retry: { maxAttempts: 1 },
  run: async (payload: { jobId: string }) => {
    const [jobs, { runEditorRender }, { ExportFailure, DownloadError }, storage, { readCaptionFontFiles }, ffmpeg, { pathForEditorExport }] = await Promise.all([
      import("@/lib/jobs/db"),
      import("@/lib/editor/render-run"),
      import("@/lib/editor/export-run"),
      import("@/lib/storage"),
      import("@/lib/editor/font-files"),
      import("@/lib/media/ffmpeg"),
      import("@/lib/storage/paths"),
    ]);
    type Input = import("@/lib/editor/render-run").RenderJobInput;

    const job = await jobs.getJob<Input>(payload.jobId);
    if (!job) throw new AbortTaskRunError(`No render job ${payload.jobId}`);
    const input = job.input;
    await jobs.startJob(job.id, "Collecting the media…");
    try {
      if (input.options.captions && input.plan.titles.length > 0 && !(await ffmpeg.ffmpegCanBurnSubtitles())) {
        logger.error("ffmpeg in this image has no libass: captions can't be burned in");
        throw new ExportFailure(NOT_READY);
      }
      const result = await runEditorRender(input, {
        fetchBytes: async (url) => {
          const res = await fetch(url);
          if (!res.ok) throw new DownloadError(res.status);
          return new Uint8Array(await res.arrayBuffer());
        },
        readFonts: readCaptionFontFiles,
        ffmpeg: ffmpeg.runFfmpegWithProgress,
        upload: async (bytes, fileName) => {
          const path = pathForEditorExport({ clientId: input.clientId, canvasId: input.canvasId, nodeId: input.nodeId, jobId: job.id, fileName });
          return (await storage.uploadEditorRender(path, bytes, fileName)).url;
        },
        setPhase: (message) => jobs.setJobPhase(job.id, message),
        now: () => new Date(),
      });
      await jobs.succeedJob(job.id, result, "Done");
      return { url: result.url, bytes: result.bytes };
    } catch (err) {
      // Only an ExportFailure carries a message written for people; anything else (fs, upload,
      // the provider) is logged with its cause and shown as the plain line.
      const plain = err instanceof ExportFailure;
      if (!plain || err.cause) logger.error("render failed", { error: String(err), cause: err instanceof Error && err.cause ? String(err.cause) : undefined });
      const message = plain ? err.message : COULDNT_RENDER;
      await jobs.failJob(job.id, message);
      throw new AbortTaskRunError(message);
    }
  },
  // A timeout or out-of-memory never reaches the catch above: settle the job here.
  onFailure: async ({ payload }) => {
    const [{ getJob, failJob }, { JOB_LIVE_STATUSES }] = await Promise.all([import("@/lib/jobs/db"), import("@/lib/jobs/types")]);
    const job = await getJob(payload.jobId);
    if (job && JOB_LIVE_STATUSES.has(job.status)) await failJob(job.id, STOPPED);
  },
});
