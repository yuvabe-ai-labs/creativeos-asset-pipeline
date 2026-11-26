// trigger/market-draft.ts
// Reads the posts in Direct and Adjacent and drafts signals from them, as cards in the client's
// copilot thread to keep, edit or drop (D530). Started from the onboarding copilot.
//
// Every @/lib import is dynamic — those modules carry `import "server-only"`, a Next.js sentinel
// Trigger.dev's separate build must not evaluate statically (see reconcile-stuck-generations.ts).
import { task, logger } from "@trigger.dev/sdk";

export const marketDraftTask = task({
  id: "market-draft",
  // Up to 10 minutes waiting for archives, then one read per post and one grouping call.
  maxDuration: 1800,
  // runMarketDraft records every failure on the job row; a retry would read and bill again.
  retry: { maxAttempts: 1 },
  run: async (payload: { jobId: string }) => {
    const { runMarketDraft } = await import("@/lib/journey/market-copilot/draft");
    const result = await runMarketDraft(payload.jobId);
    logger.info("market-draft finished", { ...payload, ...result });
  },
});
