import { task, logger, wait } from "@trigger.dev/sdk/v3";

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
    const appUrl = process.env.APP_URL;
    if (!appUrl) throw new Error("APP_URL env var not set");

    const webhookUrl = `${appUrl}/api/webhooks/generation`;

    const postWebhook = async (body: object) => {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "(unreadable)");
        logger.error("Generation webhook call failed", { status: res.status, body: text });
      }
      return res;
    };

    if (MOCK_MODE) {
      logger.info("MOCK MODE: simulating video generation", { generationId, modelId });
      await wait.for({ seconds: 30 });
      logger.info("MOCK MODE: returning hardcoded video", { generationId });
      await postWebhook({
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

      await postWebhook({
        generationId,
        status: "succeeded",
        videoUrl: result.videoUrl,
        durationSeconds: result.durationSeconds,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : "Video generation failed";
      const stack = e instanceof Error ? e.stack : undefined;
      logger.error("Video generation failed", { generationId, modelId, error, stack });

      await postWebhook({ generationId, status: "failed", error });
    }
  },
});
