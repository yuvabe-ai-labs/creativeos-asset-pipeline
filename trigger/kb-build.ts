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

    const postWebhook = (body: object) =>
      fetch(webhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${secret}`,
        },
        body: JSON.stringify(body),
      });

    const phase = (status: string, message: string) =>
      postWebhook({ jobId: payload.jobId, kind: "phase", status, message });

    try {
      const docCount = payload.docIds.length;
      const imgCount = payload.imageIds.length;

      // Phase 1: research (optional)
      let researchMarkdown: string | null = null;
      if (payload.websiteUrl) {
        await phase("researching", `Researching ${safeHost(payload.websiteUrl)}…`);
        const { researchBrandWebsite } = await import("@/lib/kb/website-research");
        researchMarkdown = await researchBrandWebsite(payload.websiteUrl);
      }

      // Phase 2: extract + analyze (parallel inside runKBExtraction)
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

      // Phase 3: finalize
      await phase("finalizing", "Building knowledge base…");
      await postWebhook({
        jobId: payload.jobId,
        kind: "succeeded",
        researchMarkdown,
        kbOutput: result.kbOutput,
        modelUsed: result.modelUsed,
        fillRate: result.fillRate,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : "KB build failed";
      logger.error("kb-build failed", { jobId: payload.jobId, error });
      await postWebhook({ jobId: payload.jobId, kind: "failed", error });
    }
  },
});
