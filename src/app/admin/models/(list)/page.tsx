import Link from "next/link";
import { Wallet } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { listAdminModels, listAdminPrices, modelMonthStats } from "@/lib/db/ai-models-admin";
import { listAdminCreditSettings } from "@/lib/db/credit-settings-admin";
import { CREDITS_HREF, buildModelsList } from "@/lib/admin/models-list";
import { ModelsList } from "@/components/admin/models/models-list";
import { NeedsALookCard } from "@/components/admin/models/needs-a-look-card";

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

  // Rows that fail their check are left out of the sums; the model page shows them.
  const { rows, attention, settingsLine } = buildModelsList({
    models,
    prices: prices.flatMap((p) => (p.price ? [p.price] : [])),
    stats,
    creditSettings: creditRows.flatMap((r) => (r.settings ? [r.settings] : [])),
    now,
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 md:px-6 md:py-14">
      <div className="mb-6 flex flex-col items-start gap-3 md:flex-row md:items-end">
        <div className="flex-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Models</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What each model costs us and what agencies pay. Runs and cost are for this month.
          </p>
        </div>
        <Link
          href={CREDITS_HREF}
          prefetch={false}
          className="-mx-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Wallet aria-hidden strokeWidth={1.5} className="size-3.5" />
          {settingsLine}
        </Link>
      </div>
      <NeedsALookCard items={attention} />
      <ModelsList rows={rows} />
    </main>
  );
}
