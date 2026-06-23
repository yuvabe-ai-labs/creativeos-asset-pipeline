import { task, logger, wait } from "@trigger.dev/sdk/v3";

// MOCK MODE — returns a hardcoded public video after 30s, no API calls.
// Set VIDEO_GEN_MOCK=false in your Trigger.dev environment to use real generation.
const MOCK_MODE = process.env.VIDEO_GEN_MOCK !== "false";
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
  }) => {
    const { generationId, modelId } = payload;
    const appUrl = process.env.APP_URL;
    if (!appUrl) throw new Error("APP_URL env var not set");

    const webhookUrl = `${appUrl}/api/webhooks/generation`;

    if (MOCK_MODE) {
      logger.info("MOCK MODE: simulating video generation", { generationId, modelId });
      await wait.for({ seconds: 30 });
      logger.info("MOCK MODE: returning hardcoded video", { generationId });
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationId,
          status: "succeeded",
          videoUrl: MOCK_VIDEO_URL,
          durationSeconds: MOCK_DURATION_SECONDS,
        }),
      });
      return;
    }

    try {
      const { videoGenRegistry } = await import("@/lib/video-gen/registry");
      const config = videoGenRegistry[modelId];
      if (!config) throw new Error(`Unknown video model: ${modelId}`);

      logger.info("Starting video generation", { generationId, modelId });

      const result = await config.generate({
        prompt: payload.prompt,
        startFrameUrl: payload.startFrameUrl,
        endFrameUrl: payload.endFrameUrl,
        referenceUrls: payload.referenceUrls ?? [],
        params: payload.params,
      });

      logger.info("Video generation succeeded", { generationId });

      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationId,
          status: "succeeded",
          videoUrl: result.videoUrl,
          durationSeconds: result.durationSeconds,
        }),
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : "Video generation failed";
      logger.error("Video generation failed", { generationId, error });

      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId, status: "failed", error }),
      });
    }
  },
});
