import { task, logger } from "@trigger.dev/sdk/v3";
import { videoGenRegistry } from "@/lib/video-gen/registry";

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
    const { generationId, modelId, prompt, startFrameUrl, endFrameUrl, referenceUrls, params } = payload;
    const appUrl = process.env.APP_URL;
    if (!appUrl) throw new Error("APP_URL env var not set");

    const webhookUrl = `${appUrl}/api/webhooks/generation`;

    try {
      const config = videoGenRegistry[modelId];
      if (!config) throw new Error(`Unknown video model: ${modelId}`);

      logger.info("Starting video generation", { generationId, modelId });

      const result = await config.generate({
        prompt,
        startFrameUrl,
        endFrameUrl,
        referenceUrls: referenceUrls ?? [],
        params,
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
