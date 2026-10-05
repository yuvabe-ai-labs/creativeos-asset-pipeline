// trigger/asset-import.ts
// Imports one source's brand images and videos — website, Instagram or Facebook (D302). One run
// per source, started together, so a slow or private source never holds up the others.
//
// Every @/lib import is dynamic — those modules carry `import "server-only"`, a Next.js sentinel
// Trigger.dev's separate build must not evaluate statically (see reconcile-stuck-generations.ts).
//
// Writes straight to Supabase and GCS with no webhook, as archive-reference does.
import { task, logger } from "@trigger.dev/sdk";

export const assetImportTask = task({
  id: "asset-import",
  // The scrape is polled for up to 12 minutes, then up to a few hundred downloads follow.
  maxDuration: 1800,
  // runAssetImport records every failure on the job row; a retry would re-scrape and re-bill.
  retry: { maxAttempts: 1 },
  run: async (payload: { jobId: string }) => {
    const { runAssetImport } = await import("@/lib/asset-import/run");
    const result = await runAssetImport(payload.jobId);
    if (result) logger.info("Asset import finished", { ...payload, ...result });
    else logger.warn("Asset import ended without assets — see the job row", payload);
    return result;
  },
});
