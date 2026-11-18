// trigger/kb-propose.ts
// Reads new or remaining brand documents against the brand KB and answers in the client's copilot
// thread with a change card (D505). Started when documents are added in the chat or saved from
// Source files on a built KB.
//
// Every @/lib import is dynamic — those modules carry `import "server-only"`, a Next.js sentinel
// Trigger.dev's separate build must not evaluate statically (see reconcile-stuck-generations.ts).
import { task, logger } from "@trigger.dev/sdk";

export const kbProposeTask = task({
  id: "kb-propose",
  // One model call over a few documents.
  maxDuration: 600,
  // runKbProposal records every failure on the job row; a retry would read and bill again.
  retry: { maxAttempts: 1 },
  run: async (payload: { jobId: string }) => {
    const { runKbProposal } = await import("@/lib/kb/changes/propose");
    await runKbProposal(payload.jobId);
    logger.info("kb-propose finished", payload);
  },
});
