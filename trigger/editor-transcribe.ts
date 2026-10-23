// trigger/editor-transcribe.ts
// Auto captions (D395): transcribes each new sound file once, saving each as it lands, then
// settles credits for the seconds that succeeded. Writes straight to Supabase (no webhook), like
// editor-export, so it also completes from a dev machine.
//
// Every @/lib import is dynamic: those modules carry `import "server-only"`, which Trigger.dev's
// separate build must not evaluate statically (see editor-export.ts).
// maxAttempts 1: a retry would pay the engine twice (rule 12).
import { AbortTaskRunError, logger, task } from "@trigger.dev/sdk";

const STOPPED = "Captions stopped before they finished. Your credits were returned.";

type Input = import("@/lib/editor/transcribe-plan").TranscribeJobInput;

export const editorTranscribeTask = task({
  id: "editor-transcribe",
  maxDuration: 900,
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 4 },
  run: async (payload: { jobId: string }) => {
    const [jobs, { runTranscription }, { transcribeUrl }, { saveTranscript }, gens, credits, cost] = await Promise.all([
      import("@/lib/jobs/db"),
      import("@/lib/transcribe/run"),
      import("@/lib/transcribe/elevenlabs"),
      import("@/lib/db/media-transcripts"),
      import("@/lib/db/generations"),
      import("@/lib/db/credit-transactions"),
      import("@/lib/transcribe/cost"),
    ]);
    const job = await jobs.getJob<Input>(payload.jobId);
    if (!job) throw new AbortTaskRunError(`No transcribe job ${payload.jobId}`);
    const input = job.input;
    await jobs.startJob(job.id, "Listening…");

    const giveBack = async (error: string) => {
      await credits.refundReservation({ orgId: input.orgId, generationId: input.generationId });
      await gens.failGeneration({ generationId: input.generationId, error });
    };

    const apiKey = process.env.ELEVEN_LABS_API_KEY;
    if (!apiKey) {
      await jobs.failJob(job.id, STOPPED);
      await giveBack("not set up");
      throw new AbortTaskRunError("ELEVEN_LABS_API_KEY is not set");
    }

    const { result, secondsDone } = await runTranscription(input, {
      transcribe: (url) => transcribeUrl(url, { fetch, apiKey }),
      save: saveTranscript,
      log: (message, data) => logger.info(message, data),
    });
    logger.info("Transcribed", { jobId: job.id, files: input.files.length, failed: result.failed.length, secondsDone });

    if (secondsDone === 0) {
      await giveBack("no file transcribed");
    } else {
      const charged = cost.transcribeCredits(secondsDone);
      await credits.settleGeneration({ orgId: input.orgId, generationId: input.generationId, actualAmount: charged });
      await gens.succeedGeneration({ generationId: input.generationId, creditsCharged: charged, costUsd: cost.transcribeCostUsd(secondsDone) });
    }
    await jobs.succeedJob(job.id, result, result.failed.length ? "Done, some clips not captioned" : "Done");
    return result;
  },
  // A timeout or crash never reaches the end of run(): settle the job and refund here.
  onFailure: async ({ payload }) => {
    const [{ getJob, failJob }, { JOB_LIVE_STATUSES }, credits, gens] = await Promise.all([
      import("@/lib/jobs/db"),
      import("@/lib/jobs/types"),
      import("@/lib/db/credit-transactions"),
      import("@/lib/db/generations"),
    ]);
    const job = await getJob<Input>(payload.jobId);
    if (!job || !JOB_LIVE_STATUSES.has(job.status)) return;
    await failJob(job.id, STOPPED);
    await credits.refundReservation({ orgId: job.input.orgId, generationId: job.input.generationId }).catch(() => null);
    await gens.failGeneration({ generationId: job.input.generationId, error: "stopped" }).catch(() => null);
  },
});
