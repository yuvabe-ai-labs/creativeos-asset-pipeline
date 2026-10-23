// trigger/editor-export.ts
// Builds the Rough Cut Editor's Premiere package (D392): downloads the reel's media from storage,
// writes the sequence, OTIO, SRT, README and fonts, zips, and uploads the zip. Progress and the
// result go on the background_jobs row the export dialog polls.
//
// Every @/lib import is dynamic — those modules carry `import "server-only"`, a Next.js sentinel
// Trigger.dev's separate build must not evaluate statically (see reconcile-stuck-generations.ts).
// Writes straight to Supabase and GCS with no webhook, so it also completes from a dev machine.
//
// One attempt: nothing is paid for, and a failure is shown to the user, who can try again.
import { AbortTaskRunError, task } from "@trigger.dev/sdk";

const STOPPED = "The export stopped before it finished. Try again.";

export const editorExportTask = task({
  id: "editor-export",
  // A reel's media is held in memory while it is zipped (capped at 700 MB in export-run.ts).
  machine: "medium-1x",
  maxDuration: 600,
  retry: { maxAttempts: 1 },
  run: async (payload: { jobId: string }) => {
    const [{ getJob, startJob, setJobPhase, succeedJob, failJob }, { runEditorExport, ExportFailure, DownloadError }, storage, { readCaptionFontFiles }] =
      await Promise.all([
        import("@/lib/jobs/db"),
        import("@/lib/editor/export-run"),
        import("@/lib/storage"),
        import("@/lib/editor/font-files"),
      ]);
    const { pathForEditorExport } = await import("@/lib/storage/paths");
    type Input = import("@/lib/editor/export-run").ExportJobInput;

    const job = await getJob<Input>(payload.jobId);
    if (!job) throw new AbortTaskRunError(`No export job ${payload.jobId}`);
    const input = job.input;
    await startJob(job.id, "Collecting the media…");
    try {
      const result = await runEditorExport(input, {
        fetchBytes: async (url) => {
          const res = await fetch(url);
          if (!res.ok) throw new DownloadError(res.status);
          return new Uint8Array(await res.arrayBuffer());
        },
        readFonts: readCaptionFontFiles,
        upload: async (zip) => {
          const path = pathForEditorExport({ clientId: input.clientId, canvasId: input.canvasId, nodeId: input.nodeId, jobId: job.id });
          return (await storage.uploadEditorExport(path, zip)).url;
        },
        setPhase: (message) => setJobPhase(job.id, message),
        now: () => new Date(),
      });
      await succeedJob(job.id, result, "Done");
      return { url: result.url, bytes: result.bytes };
    } catch (err) {
      const message = err instanceof ExportFailure ? err.message : "The export failed. Try again.";
      await failJob(job.id, message);
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
