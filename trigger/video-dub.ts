import { task, logger, wait, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { runDub, type DubRunPayload } from "@/lib/dubbing/run-dub";
import { finalUserMessage, isDeliveryFailed } from "@/lib/dubbing/poll";
import { DUB_FAILED_MESSAGE } from "@/lib/dubbing/copy";
import { createDubJob, uploadDubMedia, startDubJob, getDubLiveStatus, getDubExports } from "@/lib/sarvam/client";
import { fetchBytes, putBytes } from "@/lib/voice-change/http";
import { postGenerationWebhook, postGenerationWebhookSafely, assertWebhookConfig } from "@/lib/generations/post-webhook";

export type VideoDubTaskPayload = DubRunPayload & { dubbedUrl: string; dubbedAudioUrl: string; durationSeconds: number };

// The dub is stored but its success report could not be delivered: not `failed` (that would
// refund a stored, paid result); the stuck sweep settles it. Same as video-voice-change.
class DeliveryFailedError extends AbortTaskRunError {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryFailedError";
  }
}

// D377 — dubs one take. The route resolved the source, reserved credits and signed both uploads.
// maxAttempts 1: the vendor job is paid once; polls retry in place inside runDub. wait.for
// checkpoints, so the polling isn't billed compute and doesn't count against maxDuration.
export const videoDubTask = task({
  id: "video-dub",
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 4 },
  onFailure: async ({ payload, error }) => {
    if (error instanceof DeliveryFailedError || isDeliveryFailed(error)) return;
    await postGenerationWebhookSafely(
      { generationId: payload.generationId, status: "failed", error: finalUserMessage(error, DUB_FAILED_MESSAGE) },
      "dub failure",
    );
  },
  run: async (payload: VideoDubTaskPayload) => {
    assertWebhookConfig();
    logger.info("Dubbing", { generationId: payload.generationId, targetLang: payload.targetLang });
    const { vendorJobId } = await runDub(payload, {
      fetchBytes: (url) => fetchBytes(url),
      createJob: (a) => createDubJob(a),
      upload: (url, body, type) => uploadDubMedia(url, body, type),
      start: (id) => startDubJob(id),
      liveStatus: (id) => getDubLiveStatus(id),
      exports: (id) => getDubExports(id),
      putBytes,
      sleep: (seconds) => wait.for({ seconds }),
      now: () => Date.now(),
    });
    try {
      await postGenerationWebhook({
        generationId: payload.generationId,
        status: "succeeded",
        kind: "dub",
        stored: true,
        dubbedUrl: payload.dubbedUrl,
        dubbedAudioUrl: payload.dubbedAudioUrl,
        durationSeconds: payload.durationSeconds,
        vendorJobId,
      });
    } catch (e) {
      throw new DeliveryFailedError(`Dub stored but the webhook was unreachable — dubbedUrl=${payload.dubbedUrl}: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
});
