// trigger/reconcile-billing.ts
// The check against Razorpay (D585). Webhooks can be late, missing or out of order, and Razorpay
// disables a webhook after 24 hours of failures, so two schedules bring our records in line:
//   - hourly: top-ups whose payment went through but whose order.paid never arrived;
//   - nightly (02:00 India time): every live plan's status, any charge we missed, and plans unpaid
//     for 30 days, which are ended; then any move to a new price not yet set up on Razorpay
//     (D593: a move-plan-price run that never happened, a payment that was due, Razorpay down).
// Both use the webhook's once-only functions, so a repeat changes nothing.
//
// Every @/lib import is dynamic: those modules carry `import "server-only"`, which Trigger.dev's
// separate build must not evaluate statically.
import { schedules, logger } from "@trigger.dev/sdk";

export const reconcileBillingOrdersTask = schedules.task({
  id: "reconcile-billing-orders",
  cron: "7 * * * *",
  maxDuration: 300,
  run: async () => {
    const { reconcileOrders } = await import("@/lib/billing/reconcile");
    const report = await reconcileOrders();
    if (report.checked > 0) logger.info("Checked unpaid top-ups", report);
    return report;
  },
});

export const reconcileBillingPlansTask = schedules.task({
  id: "reconcile-billing-plans",
  cron: "30 20 * * *",
  maxDuration: 900,
  run: async () => {
    const { reconcileSubscriptions } = await import("@/lib/billing/reconcile");
    const { movePendingPlans } = await import("@/lib/billing/plan-moves");
    const report = await reconcileSubscriptions();
    logger.info("Checked plans against Razorpay", report);
    // After the statuses, so a plan that was paid today is active and can move.
    const moves = await movePendingPlans();
    if (moves.checked > 0) logger.info("Set up moves to a new price", moves);
    return { ...report, moves };
  },
});
