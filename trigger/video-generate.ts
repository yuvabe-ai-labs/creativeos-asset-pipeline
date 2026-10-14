import { task, logger, wait, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { postGenerationWebhook, postGenerationWebhookSafely, assertWebhookConfig } from "@/lib/generations/post-webhook";
import { PaidResultError, isFinalAttempt } from "@/lib/generations/task-failure";

// D366 — no automatic retry. A video provider bills the job when it is submitted, so a retry after a
// failed or timed-out poll would pay for a second clip. The operator regenerates instead.
const MAX_ATTEMPTS = 1;

const MOCK_VIDEO_URL = "https://www.w3schools.com/html/mov_bbb.mp4";
const MOCK_DURATION_SECONDS = 8;

export const videoGenerateTask = task({
  id: "video-generate",
  // Must outlast the providers' own poll deadlines: Seedance waits up to 30 minutes
  // (POLL_DEADLINE_MS, matching the 30-minute timeout in BytePlus's own samples), and this
  // limit counts compute time, which that in-process polling uses. At 600 a long Seedance job
  // was killed mid-poll with MAX_DURATION_EXCEEDED, which Trigger never retries and which skips
  // the catch below, so no failure webhook was sent and the paid-for video was never collected.
  // 40 minutes = the 30-minute poll plus room to download, store and report the result.
  maxDuration: 2400,
  retry: { maxAttempts: MAX_ATTEMPTS },
  run: async (payload: {
    generationId: string;
    modelId: string;
    prompt: string;
    startFrameUrl?: string;
    endFrameUrl?: string;
    referenceUrls: string[];
    /** D299 — the presenter's voice, on Seedance. Other providers ignore it. */
    referenceAudioUrl?: string;
    params: Record<string, unknown>;
    mockMode?: boolean;
  }, { ctx }) => {
    const { generationId, modelId } = payload;
    const MOCK_MODE = payload.mockMode === true;
    // Fail fast on a misconfigured deploy — before the mock wait and before any (paid) provider
    // call, exactly where the pre-D284 inline version checked (restored after the D284 extraction
    // to post-webhook.ts dropped it — review fix).
    const { url: webhookUrl } = assertWebhookConfig();

    if (MOCK_MODE) {
      logger.info("MOCK MODE: simulating video generation", { generationId, modelId });
      await wait.for({ seconds: 30 });
      logger.info("MOCK MODE: returning hardcoded video", { generationId });
      await postGenerationWebhook({
        generationId,
        status: "succeeded",
        videoUrl: MOCK_VIDEO_URL,
        durationSeconds: MOCK_DURATION_SECONDS,
      });
      return;
    }

    try {
      const { videoGenRegistry } = await import("@/lib/video-gen/registry");
      const config = videoGenRegistry[modelId];
      if (!config) throw new Error(`Unknown video model: ${modelId}`);

      logger.info("Starting video generation", {
        generationId,
        modelId,
        prompt: payload.prompt.slice(0, 120),
        hasStartFrame: !!payload.startFrameUrl,
        hasEndFrame: !!payload.endFrameUrl,
        referenceCount: payload.referenceUrls?.length ?? 0,
        params: payload.params,
      });

      const result = await config.generate({
        prompt: payload.prompt,
        startFrameUrl: payload.startFrameUrl,
        endFrameUrl: payload.endFrameUrl,
        referenceUrls: payload.referenceUrls ?? [],
        referenceAudioUrl: payload.referenceAudioUrl,
        params: payload.params,
      });

      logger.info("Video generation call succeeded", {
        generationId,
        modelId,
        videoUrl: result.videoUrl,
        durationSeconds: result.durationSeconds,
      });

      // The video EXISTS and has been billed: nothing from here may lead to a retry.
      let res: Response;
      try {
        res = await postGenerationWebhook({
          generationId,
          status: "succeeded",
          videoUrl: result.videoUrl,
          durationSeconds: result.durationSeconds,
        });
      } catch (e) {
        // Name the URL, so a run lost to an unreachable webhook can be reconciled by hand.
        throw new PaidResultError(
          `Video generated but the webhook at ${webhookUrl} was unreachable — ` +
            `videoUrl=${result.videoUrl}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      if (!res.ok) {
        throw new PaidResultError(
          `Video generated but the webhook rejected it (${res.status}) — videoUrl=${result.videoUrl}`,
        );
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : "Video generation failed";
      const stack = e instanceof Error ? e.stack : undefined;
      const final = isFinalAttempt(ctx.attempt.number, MAX_ATTEMPTS, e);
      logger.error("Video generation failed", { generationId, modelId, error, stack, attempt: ctx.attempt.number, final });

      // Only a final failure is reported: reporting refunds and closes the generation, so a retry's
      // result would be discarded. Safely: this is the ONLY record of why it failed.
      if (final) {
        await postGenerationWebhookSafely({ generationId, status: "failed", error }, "failure report");
      }
      // A paid result is never retried. Otherwise rethrow, so the run is marked failed with the
      // REAL reason (swallowing it made a failed generation show as a successful run).
      if (e instanceof PaidResultError) throw new AbortTaskRunError(error);
      throw e instanceof Error ? e : new Error(error);
    }
  },
});
