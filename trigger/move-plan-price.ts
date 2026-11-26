// trigger/move-plan-price.ts
// After an admin changes a plan's price, every running plan on the old price moves to the new one
// from its next renewal, on Razorpay too (D593). One run per price change; it sets up every move
// still waiting, five plans at a time. One run at a time, so two quick price changes are handled in
// order and Razorpay ends on the latest price.
//
// A retry is safe: each plan is read again before Razorpay is asked, nothing is sent when Razorpay
// already has the plan, and each answer is saved once. What a run leaves (a payment due, Razorpay
// unreachable) the nightly reconcile-billing-plans picks up.
//
// Every @/lib import is dynamic: those modules carry `import "server-only"`, which Trigger.dev's
// separate build must not evaluate statically.
import { task, logger } from "@trigger.dev/sdk";

export const movePlanPriceTask = task({
  id: "move-plan-price",
  maxDuration: 900,
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 3, minTimeoutInMs: 30_000, maxTimeoutInMs: 120_000, factor: 2 },
  run: async (payload: { productId: string }) => {
    const { movePendingPlans } = await import("@/lib/billing/plan-moves");
    const report = await movePendingPlans();
    logger.info("Moved plans to the new price", { ...payload, ...report });
    return report;
  },
});
