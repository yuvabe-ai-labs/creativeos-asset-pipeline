import Link from "next/link";
import { Coins } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { listAdminModels, listAdminPrices, modelMonthStats } from "@/lib/db/ai-models-admin";
import { listAdminCreditSettings } from "@/lib/db/credit-settings-admin";
import { CREDITS_HREF, buildModelsList } from "@/lib/admin/models-list";
import { monthTotals } from "@/lib/admin/models-catalog";
import { Button } from "@/components/ui/button";
import { ModelsCatalog } from "@/components/admin/models/models-catalog";
import { Money } from "@/components/admin/models/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Models — Admin" };

export default async function AdminModelsPage() {
  await requireSuperAdmin();

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

  const [models, prices, stats, creditRows] = await Promise.all([
    listAdminModels(),
    listAdminPrices(),
    modelMonthStats(from, to),
    listAdminCreditSettings(),
  ]);

  // Models that fail their check are listed and flagged. Price and credit settings rows that fail
  // theirs are left out of the sums and flagged under Needs a look; the model and Credits pages show them.
  const { rows, attention, settingsLine } = buildModelsList({
    models,
    prices: prices.flatMap((p) => (p.price ? [p.price] : [])),
    stats,
    creditSettings: creditRows.flatMap((r) => (r.settings ? [r.settings] : [])),
    brokenPriceModelIds: prices.flatMap((p) => (p.price ? [] : [p.modelId])),
    brokenCreditSettings: creditRows.some((r) => !r.settings),
    now,
  });
  const month = monthTotals(rows);
  const monthName = now.toLocaleString("en-US", { month: "long", timeZone: "UTC" });

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 md:px-6 md:py-14">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="max-w-2xl">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Models</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What agencies can pick, by kind. Credits are for a typical run: one run at the picker&apos;s default settings, shown
            under each number. {monthName} so far:{" "}
            {month.runs ? (
              <>
                <span className="text-foreground tabular-nums">
                  {month.runs.toLocaleString("en-US")} {month.runs === 1 ? "run" : "runs"}
                </span>
                , <Money usd={month.costUsd} className="text-foreground" /> provider cost.
              </>
            ) : (
              "no runs yet."
            )}
          </p>
        </div>
        <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Coins aria-hidden strokeWidth={1.5} className="size-3.5" />
          {settingsLine}
          <Button variant="link" size="xs" className="h-auto px-0" nativeButton={false} render={<Link href={CREDITS_HREF} prefetch={false} />}>
            Credit settings
          </Button>
        </p>
      </div>
      <ModelsCatalog rows={rows} attention={attention} />
    </main>
  );
}
