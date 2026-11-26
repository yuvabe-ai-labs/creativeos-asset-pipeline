import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { listAdminModels, listAdminPrices, modelRunsByAgency } from "@/lib/db/ai-models-admin";
import { listAdminCreditSettings } from "@/lib/db/credit-settings-admin";
import { creditSettingsAt } from "@/lib/credits/units";
import { creditHistory, keptOnCancel, modelTypicalRuns, typicalCreditRuns } from "@/lib/admin/credits-page";
import { nextCreditChange, nowRow, referenceRun } from "@/lib/admin/credits-overview";
import { CreditsWorkspace } from "@/components/admin/credits/credits-workspace";
import { adminPageClass } from "@/components/admin/admin-page";

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
  const runs = typicalCreditRuns(catalog, now);
  const modelRuns = modelTypicalRuns(catalog, agencyRuns.map((r) => r.modelId), now);

  return (
    <main className={adminPageClass()}>
      <CreditsWorkspace
        now={nowRow(liveRow)}
        next={nextCreditChange({ settings, now, reference: referenceRun(catalog, agencyRuns, now), runs, agencyRuns, modelRuns })}
        history={{ timeline: creditHistory(creditRows, { now, callerId: caller.userId }), kept: keptOnCancel(settings, now) }}
        live={live}
        settings={settings}
        starts={creditRows.map((r) => ({ id: r.id, effectiveFrom: r.effectiveFrom }))}
        runs={runs}
        agencyRuns={agencyRuns}
        modelRuns={modelRuns}
      />
    </main>
  );
}
