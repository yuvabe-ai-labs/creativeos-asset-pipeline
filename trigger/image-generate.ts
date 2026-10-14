// D366 — Image Gen and Composite generations, run in the background like video-generate. Every
// @/lib import is dynamic: several carry `server-only`, which Trigger.dev's build must not see.
import { task, logger, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import type { ImageGenerateTaskPayload } from "@/lib/image-gen/task-payload";

// One retry for a transient provider error: an image is one request/response, and a failed call
// is not billed. (video-generate takes none: its jobs are billed when submitted.)
const MAX_ATTEMPTS = 2;

export const imageGenerateTask = task({
  id: "image-generate",
  maxDuration: 600,
  retry: { maxAttempts: MAX_ATTEMPTS, minTimeoutInMs: 2000, maxTimeoutInMs: 15000, factor: 2 },
  // `failed` is posted once the run has failed for good, so a retry that succeeds is never thrown
  // away. onFailure is Trigger's own "no more attempts" signal; counting attempts in the catch is
  // not, since Trigger may skip a retry (retries are off in dev, see trigger.config.ts).
  onFailure: async ({ payload, error }: { payload: ImageGenerateTaskPayload; error: unknown }) => {
    const { postGenerationWebhookSafely } = await import("@/lib/generations/post-webhook");
    const message = error instanceof Error ? error.message : "Image generation failed";
    await postGenerationWebhookSafely(
      { generationId: payload.generationId, status: "failed", error: message },
      "failure report",
    );
  },
  run: async (payload: ImageGenerateTaskPayload, { ctx }) => {
    const { assertWebhookConfig, postGenerationWebhook } = await import(
      "@/lib/generations/post-webhook"
    );
    // Fail fast on a misconfigured deploy, before any (paid) provider call.
    assertWebhookConfig();
    const { generationId, modelId } = payload;

    try {
      const { imageGenRegistry } = await import("@/lib/image-gen/registry");
      const config = imageGenRegistry[modelId];
      if (!config) throw new Error(`Unknown image model: ${modelId}`);
      const { runImageGenerateTask } = await import("@/lib/image-gen/run-task");
      const sharp = (await import("sharp")).default;

      logger.info("Starting image generation", {
        generationId,
        modelId,
        referenceCount: payload.referenceUrls.length,
        masked: Boolean(payload.maskUrl),
      });

      await runImageGenerateTask(payload, {
        generate: (input) => config.generate(input),
        fetchFn: fetch,
        readSize: async (bytes) => {
          const meta = await sharp(bytes).metadata();
          return { width: meta.width, height: meta.height };
        },
        postWebhook: postGenerationWebhook,
      });

      logger.info("Image generation succeeded", { generationId, modelId });
    } catch (e) {
      const error = e instanceof Error ? e.message : "Image generation failed";
      const { PaidResultError } = await import("@/lib/generations/task-failure");
      logger.error("Image generation failed", {
        generationId,
        modelId,
        error,
        attempt: ctx.attempt.number,
        stack: e instanceof Error ? e.stack : undefined,
      });
      // A paid result is never retried: that would pay the provider again. The failure is reported
      // by onFailure once no attempt is left.
      if (e instanceof PaidResultError) throw new AbortTaskRunError(error);
      throw e instanceof Error ? e : new Error(error);
    }
  },
});
