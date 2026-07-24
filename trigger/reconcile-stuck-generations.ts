// trigger/reconcile-stuck-generations.ts
// See docs/superpowers/specs/2026-07-24-credit-system-design.md §4. Every @/lib import here
// is dynamic (await import(...)), not static — those modules carry `import "server-only"`,
// a Next.js-specific sentinel not meant for Trigger.dev's separate build. Matches the
// existing convention in trigger/video-generate.ts and trigger/kb-build.ts exactly (neither
// has a single static @/lib import).
import { schedules, logger } from "@trigger.dev/sdk/v3";

export const reconcileStuckGenerationsTask = schedules.task({
  id: "reconcile-stuck-generations",
  cron: "*/15 * * * *",
  run: async () => {
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const { getGeneration, failGeneration } = await import("@/lib/db/generations");
    const { refundReservation } = await import("@/lib/db/credit-transactions");

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("stuck_reservations")
      .select("generation_id, org_id");
    if (error) throw error;

    const rows = (data ?? []) as { generation_id: string; org_id: string }[];
    logger.info("Reconciliation sweep found stuck reservations", { count: rows.length });

    for (const row of rows) {
      try {
        const generation = await getGeneration(row.generation_id);
        // Already-terminal rows here mean a prior refund attempt itself failed (see the
        // migration's comment) — failGeneration was already called once; calling it again
        // would be redundant, not incorrect, but skipping it keeps the log signal clean.
        if (generation.status === "running") {
          await failGeneration({
            generationId: row.generation_id,
            error: "Generation timed out — no response from provider",
          });
        }
        // Idempotent (sub-plan 3C) — safe even if a concurrent request already resolved
        // this generation between the view read above and this call.
        await refundReservation({ orgId: row.org_id, generationId: row.generation_id });
        logger.info("Reconciled stuck generation", {
          generationId: row.generation_id,
          priorStatus: generation.status,
        });
      } catch (e) {
        // One bad row must not abort the sweep — log and continue; the next scheduled run
        // picks up anything still unresolved regardless.
        logger.error("Failed to reconcile stuck generation", {
          generationId: row.generation_id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  },
});
