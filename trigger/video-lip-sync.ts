import { task, logger, wait, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { runLipSync, type LipSyncRunPayload } from "@/lib/dubbing/run-lip-sync";
import { finalUserMessage, isDeliveryFailed } from "@/lib/dubbing/poll";
import { LIP_SYNC_FAILED_MESSAGE } from "@/lib/dubbing/copy";
import { submitLipSync, getFalStatus, getLipSyncResult } from "@/lib/fal/client";
import { fetchBytes, putBytes } from "@/lib/voice-change/http";
import { postGenerationWebhook, postGenerationWebhookSafely, assertWebhookConfig } from "@/lib/generations/post-webhook";

export type VideoLipSyncTaskPayload = LipSyncRunPayload & { generationId: string; lipSyncedUrl: string; durationSeconds: number };

// Stored but undelivered: not `failed` (see video-dub.ts).
class DeliveryFailedError extends AbortTaskRunError {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryFailedError";
  }
}

// D377 — lip-syncs a dub's original video to its dubbed audio. Paid once; see video-dub.ts.
export const videoLipSyncTask = task({
  id: "video-lip-sync",
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 4 },
  onFailure: async ({ payload, error }) => {
    if (error instanceof DeliveryFailedError || isDeliveryFailed(error)) return;
    await postGenerationWebhookSafely(
      { generationId: payload.generationId, status: "failed", error: finalUserMessage(error, LIP_SYNC_FAILED_MESSAGE) },
      "lip sync failure",
    );
  },
  // A run cancelled from the dashboard refunds at once. (A dev CLI that exits takes the worker
  // with it, so this never runs then; the stuck-reservation sweep settles that case.)
  onCancel: async ({ payload }) => {
    await postGenerationWebhookSafely({ generationId: payload.generationId, status: "failed", error: LIP_SYNC_FAILED_MESSAGE }, "lip sync cancelled");
  },
  run: async (payload: VideoLipSyncTaskPayload) => {
    assertWebhookConfig();
    logger.info("Lip syncing", { generationId: payload.generationId });
    const { vendorRequestId } = await runLipSync(payload, {
      submit: (a) => submitLipSync(a),
      status: (url) => getFalStatus(url),
      result: (url) => getLipSyncResult(url),
      fetchBytes: (url) => fetchBytes(url),
      putBytes,
      sleep: (seconds) => wait.for({ seconds }),
      now: () => Date.now(),
      log: (message, data) => logger.info(message, data),
    });
    try {
      await postGenerationWebhook({
        generationId: payload.generationId,
        status: "succeeded",
        kind: "lipsync",
        stored: true,
        videoUrl: payload.lipSyncedUrl,
        durationSeconds: payload.durationSeconds,
        vendorRequestId,
      });
    } catch (e) {
      throw new DeliveryFailedError(`Lip sync stored but the webhook was unreachable — videoUrl=${payload.lipSyncedUrl}: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
});
