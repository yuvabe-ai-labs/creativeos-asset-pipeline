import { task, logger, wait } from "@trigger.dev/sdk/v3";
import { postGenerationWebhook, postGenerationWebhookSafely } from "@/lib/generations/post-webhook";

const MOCK_VIDEO_URL = "https://www.w3schools.com/html/mov_bbb.mp4";
const MOCK_DURATION_SECONDS = 8;

export const videoGenerateTask = task({
  id: "video-generate",
  maxDuration: 600,
  run: async (payload: {
    generationId: string;
    modelId: string;
    prompt: string;
    startFrameUrl?: string;
    endFrameUrl?: string;
    referenceUrls: string[];
    params: Record<string, unknown>;
    mockMode?: boolean;
  }) => {
    const { generationId, modelId } = payload;
    const MOCK_MODE = payload.mockMode === true;

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
        params: payload.params,
      });

      logger.info("Video generation call succeeded", {
        generationId,
        modelId,
        videoUrl: result.videoUrl,
        durationSeconds: result.durationSeconds,
      });

      try {
        await postGenerationWebhook({
          generationId,
          status: "succeeded",
          videoUrl: result.videoUrl,
          durationSeconds: result.durationSeconds,
        });
      } catch (e) {
        // The video EXISTS and has been billed. Fail loudly and name the URL, so a run lost to an
        // unreachable webhook can still be reconciled by hand instead of leaving a paid-for
        // generation stuck pending with no trace of where it went.
        throw new Error(
          `Video generated but the webhook at ${process.env.APP_URL}/api/webhooks/generation was unreachable — ` +
            `videoUrl=${result.videoUrl}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : "Video generation failed";
      const stack = e instanceof Error ? e.stack : undefined;
      logger.error("Video generation failed", { generationId, modelId, error, stack });

      // Safely: this is the ONLY record of why the generation failed. An unguarded post here
      // threw over the top of `error` and lost it.
      await postGenerationWebhookSafely({ generationId, status: "failed", error }, "failure report");
      // Rethrow so the run itself is marked failed with the REAL reason. Swallowing it made a
      // failed generation show up as a successful run in the Trigger dashboard.
      throw e instanceof Error ? e : new Error(error);
    }
  },
});
