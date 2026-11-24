// trigger/market-fetch.ts
// Brings in the recent Instagram posts of the brands a person confirmed on a brands card, as
// references in Direct and Adjacent (D530). Started by confirming the card, in the chat or with its
// button.
//
// Every @/lib import is dynamic — those modules carry `import "server-only"`, a Next.js sentinel
// Trigger.dev's separate build must not evaluate statically (see reconcile-stuck-generations.ts).
import { task, logger } from "@trigger.dev/sdk";

export const marketFetchTask = task({
  id: "market-fetch",
  // One scraper call per brand (up to ten), each up to a few minutes.
  maxDuration: 900,
  // runMarketFetch records every failure on the job row; a retry would scrape and pay again.
  retry: { maxAttempts: 1 },
  run: async (payload: { jobId: string }) => {
    const { runMarketFetch } = await import("@/lib/journey/market-copilot/fetch");
    const result = await runMarketFetch(payload.jobId);
    logger.info("market-fetch finished", { ...payload, ...result });
  },
});
