// trigger/image-analysis.ts
// Reads a client's brand images into cards and rewrites the Brand KB's Image Analysis section
// (D312). Started after uploads, imports and KB builds; one live run per client.
//
// Every @/lib import is dynamic — those modules carry `import "server-only"`, a Next.js sentinel
// Trigger.dev's separate build must not evaluate statically (see reconcile-stuck-generations.ts).
import { task, logger } from "@trigger.dev/sdk";

export const imageAnalysisTask = task({
  id: "image-analysis",
  // ~1.5 s an image, six at a time: a few hundred images is a few minutes.
  maxDuration: 1800,
  // runImageAnalysis records every failure on the job row; a retry would re-read and re-bill.
  retry: { maxAttempts: 1 },
  run: async (payload: { jobId: string }) => {
    const { runImageAnalysis } = await import("@/lib/image-analysis/run");
    const result = await runImageAnalysis(payload.jobId);
    if (result) logger.info("Image analysis finished", { ...payload, ...result });
    else logger.warn("Image analysis ended without a result — see the job row", payload);
    return result;
  },
});
