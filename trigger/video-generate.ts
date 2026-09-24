import { task, logger, wait, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { deliverWithVoice, OriginalStoreError } from "@/lib/voice-change/deliver";
import { fetchBytes, putBytes } from "@/lib/voice-change/http";
import { videoDownloadHeaders } from "@/lib/video-gen/download-headers";
import type { VoicePayload } from "@/lib/voice-change/types";
import { videoRevoiceTask } from "./video-revoice";

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
    /** D282 — present only when the node has a voice selected. */
    voice?: VoicePayload;
  }) => {
    const { generationId, modelId } = payload;
    const MOCK_MODE = payload.mockMode === true;
    const appUrl = process.env.APP_URL;
    if (!appUrl) throw new Error("APP_URL env var not set");
    const secret = process.env.TRIGGER_WEBHOOK_SECRET;
    if (!secret) throw new Error("TRIGGER_WEBHOOK_SECRET env var not set");

    const webhookUrl = `${appUrl}/api/webhooks/generation`;

    const postWebhook = async (body: object) => {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${secret}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "(unreadable)");
        logger.error("Generation webhook call failed", { status: res.status, body: text });
      }
      return res;
    };

    /**
     * Report a webhook TRANSPORT failure without letting it replace the thing being reported.
     *
     * Node's fetch reports every transport failure as the same opaque `TypeError: fetch failed`
     * with the real reason only on `cause`. Thrown from the catch block below, it escaped the task
     * as the run's error — so a generation that failed for a real, nameable reason surfaced as a
     * bare "fetch failed" with the actual cause discarded, and the generation row was never marked
     * failed either. That is how an APP_URL typo (https:// against an http dev server, cause
     * ERR_SSL_WRONG_VERSION_NUMBER) masqueraded as an Omni problem.
     */
    const postWebhookSafely = async (body: object, context: string) => {
      try {
        await postWebhook(body);
      } catch (e) {
        const chain: string[] = [];
        let cur: unknown = e;
        for (let i = 0; i < 4 && cur instanceof Error; i += 1) {
          const code = (cur as { code?: unknown }).code;
          chain.push(typeof code === "string" ? `${cur.message} [${code}]` : cur.message);
          cur = (cur as { cause?: unknown }).cause;
        }
        logger.error("Generation webhook unreachable", {
          context,
          webhookUrl,
          reason: chain.join(" ← "),
        });
      }
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

      // D282 — voice selected: store the original, re-voice it in the child task, and report the
      // already-stored URL. Without a voice this block is skipped and the path below is unchanged.
      if (payload.voice) {
        let delivered: Awaited<ReturnType<typeof deliverWithVoice>>;
        try {
          delivered = await deliverWithVoice(
            { providerVideoUrl: result.videoUrl, voice: payload.voice },
            {
              fetchProviderVideo: (url) => fetchBytes(url, videoDownloadHeaders(modelId)),
              putBytes,
              revoice: async (args) => {
                const run = await videoRevoiceTask.triggerAndWait(args);
                if (run.ok) return { ok: true };
                const message = (run.error as { message?: unknown } | undefined)?.message;
                return { ok: false, error: typeof message === "string" ? message : "Voice change failed" };
              },
            },
          );
        } catch (e) {
          // No stored original means nothing to deliver. Abort (no retry): a retry would generate
          // — and pay for — the video again. The catch below reports the failure to the webhook.
          if (e instanceof OriginalStoreError) throw new AbortTaskRunError(e.message);
          throw e;
        }

        logger.info("Voice change finished", { generationId, voice: delivered.meta.voice.status });
        try {
          await postWebhook({
            generationId,
            status: "succeeded",
            stored: true,
            videoUrl: delivered.videoUrl,
            durationSeconds: result.durationSeconds,
            meta: delivered.meta,
          });
        } catch (e) {
          throw new Error(
            `Video generated but the webhook at ${webhookUrl} was unreachable — ` +
              `videoUrl=${delivered.videoUrl}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        return;
      }

      try {
        await postWebhook({
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
          `Video generated but the webhook at ${webhookUrl} was unreachable — ` +
            `videoUrl=${result.videoUrl}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : "Video generation failed";
      const stack = e instanceof Error ? e.stack : undefined;
      logger.error("Video generation failed", { generationId, modelId, error, stack });

      // Safely: this is the ONLY record of why the generation failed. An unguarded post here
      // threw over the top of `error` and lost it.
      await postWebhookSafely({ generationId, status: "failed", error }, "failure report");
      // Rethrow so the run itself is marked failed with the REAL reason. Swallowing it made a
      // failed generation show up as a successful run in the Trigger dashboard.
      throw e instanceof Error ? e : new Error(error);
    }
  },
});
