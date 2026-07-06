import { task, logger } from "@trigger.dev/sdk/v3";
import { buildExtractingMessage } from "@/lib/kb/build-message";

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const kbBuildTask = task({
  id: "kb-build",
  maxDuration: 600,
  run: async (payload: {
    jobId: string;
    clientId: string;
    websiteUrl: string | null;
    docIds: string[];
    imageIds: string[];
  }) => {
    const appUrl = process.env.APP_URL;
    if (!appUrl) throw new Error("APP_URL env var not set");
    const secret = process.env.TRIGGER_WEBHOOK_SECRET;
    if (!secret) throw new Error("TRIGGER_WEBHOOK_SECRET env var not set");
    const webhook = `${appUrl}/api/webhooks/kb-build`;

    const postWebhook = async (body: object) => {
      const res = await fetch(webhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${secret}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "(unreadable)");
        logger.error("Webhook call failed", { status: res.status, body: text, kind: (body as Record<string, unknown>).kind });
      }
      return res;
    };

    const phase = (status: string, message: string) =>
      postWebhook({ jobId: payload.jobId, kind: "phase", status, message });

    try {
      const docCount = payload.docIds.length;
      const imgCount = payload.imageIds.length;

      logger.info("kb-build started", {
        jobId: payload.jobId,
        clientId: payload.clientId,
        docCount,
        imgCount,
        hasWebsite: !!payload.websiteUrl,
      });

      // Phase 1: research (optional)
      let researchMarkdown: string | null = null;
      if (payload.websiteUrl) {
        logger.info("Phase 1: researching website", { url: payload.websiteUrl });
        await phase("researching", `Researching ${safeHost(payload.websiteUrl)}…`);
        const { researchBrandWebsite } = await import("@/lib/kb/website-research");
        researchMarkdown = await researchBrandWebsite(payload.websiteUrl);
        logger.info("Phase 1: research complete", { chars: researchMarkdown?.length ?? 0 });
      }

      // Phase 2: extract + analyze (parallel inside runKBExtraction)
      logger.info("Phase 2: extracting KB", { docCount, imgCount, hasResearch: researchMarkdown !== null });
      await phase("extracting", buildExtractingMessage({
        hasResearch: researchMarkdown !== null,
        docCount,
        imgCount,
      }));
      const { runKBExtraction } = await import("@/lib/kb/extraction");
      const result = await runKBExtraction({
        clientId: payload.clientId,
        docIds: payload.docIds,
        imageIds: payload.imageIds,
        researchMarkdown,
      });
      logger.info("Phase 2: extraction complete", { modelUsed: result.modelUsed, fillRate: result.fillRate });

      // Phase 3: finalize
      logger.info("Phase 3: posting succeeded webhook");
      await phase("finalizing", "Building knowledge base…");
      await postWebhook({
        jobId: payload.jobId,
        kind: "succeeded",
        researchMarkdown,
        kbOutput: result.kbOutput,
        modelUsed: result.modelUsed,
        fillRate: result.fillRate,
      });
      logger.info("kb-build done", { jobId: payload.jobId, fillRate: result.fillRate });
    } catch (e) {
      const error = e instanceof Error ? e.message : "KB build failed";
      const stack = e instanceof Error ? e.stack : undefined;
      logger.error("kb-build failed", { jobId: payload.jobId, error, stack });
      await postWebhook({ jobId: payload.jobId, kind: "failed", error });
    }
  },
});
