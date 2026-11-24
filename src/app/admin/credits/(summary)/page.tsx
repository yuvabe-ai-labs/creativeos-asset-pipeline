import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { listAdminModels, listAdminPrices, modelRunsByAgency } from "@/lib/db/ai-models-admin";
import { listAdminCreditSettings } from "@/lib/db/credit-settings-admin";
import { creditSettingsAt } from "@/lib/credits/units";
import { creditHistory, creditsSummary, keptOnCancel, modelTypicalRuns, typicalCreditRuns } from "@/lib/admin/credits-page";
import { CreditHistory } from "@/components/admin/credits/credit-history";
import { CreditsWorkspace } from "@/components/admin/credits/credits-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Credits — Admin" };

export default async function AdminCreditsPage() {
  const caller = await requireSuperAdmin();

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

  // A fixed set of queries in one round: the agencies' month comes from one grouped query.
  const [models, priceRows, creditRows, agencyRows] = await Promise.all([
    listAdminModels(),
    listAdminPrices(),
    listAdminCreditSettings(),
    modelRunsByAgency(from, to),
  ]);

  // Rows that fail their check are left out of the sums; the history still shows them.
  const catalog = {
    models: models.flatMap((m) => (m.model ? [m.model] : [])),
    prices: priceRows.flatMap((p) => (p.price ? [p.price] : [])),
  };
  const settings = creditRows.flatMap((r) => (r.settings ? [r.settings] : []));
  const liveRow = creditSettingsAt({ creditSettings: settings }, now);
  const live = { marginPercent: liveRow.marginPercent, roundStep: liveRow.roundStep };
  const agencyRuns = agencyRows.map((r) => ({ modelId: r.modelId, orgId: r.orgId, orgName: r.orgName, runs: r.runs }));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 md:px-6 md:py-14">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Credits</h1>
        <p className="mt-1 text-sm text-muted-foreground">How the cost of a run becomes credits, for every model and every agency.</p>
      </div>
      <CreditsWorkspace
        summary={creditsSummary(settings, live, now)}
        live={live}
        settings={settings}
        starts={creditRows.map((r) => ({ id: r.id, effectiveFrom: r.effectiveFrom }))}
        runs={typicalCreditRuns(catalog, now)}
        agencyRuns={agencyRuns}
        modelRuns={modelTypicalRuns(catalog, agencyRuns.map((r) => r.modelId), now)}
        aside={
          <aside aria-label="History" className="flex flex-col gap-6">
            <section aria-labelledby="history-title">
              <h2 id="history-title" className="mb-3 font-display text-base font-semibold tracking-tight">History</h2>
              <CreditHistory timeline={creditHistory(creditRows, { now, callerId: caller.userId })} kept={keptOnCancel(settings, now)} />
            </section>
            <section aria-labelledby="which-title" className="border-t pt-6">
              <h2 id="which-title" className="mb-2 font-display text-base font-semibold tracking-tight">Which settings a run uses</h2>
              <p className="text-[0.8125rem] text-muted-foreground">
                The settings live when the run started. A change never touches runs already made or still running.
              </p>
            </section>
          </aside>
        }
      />
    </main>
  );
}
