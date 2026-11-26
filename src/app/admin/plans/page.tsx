import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { getBillingSettings, getCatalog, getOfferHealth } from "@/lib/db/billing-catalog";
import { getPriceMoves } from "@/lib/db/billing-plan-moves";
import { usageRange } from "@/lib/billing/usage-period";
import { offerView } from "@/lib/admin/plans-page";
import { SettingsLine } from "@/components/admin/plans/settings-line";
import { PlansView } from "@/components/admin/plans/plans-view";
import { OfferDialog } from "@/components/admin/plans/offer-dialog";
import { adminPageClass } from "@/components/admin/admin-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plans and prices — Admin" };

// Admin › Plans and prices, cards with health (D592). Four calls in parallel whatever the number of
// agencies: the catalog with its prices, the settings in force, every price's running plans and
// this month's payments (grouped in the database, migration 0102), and the plans moving to a new
// price (grouped, migration 0103, D593).
export default async function AdminPlansPage() {
  await requireSuperAdmin();
  const [catalog, settings, health, moves] = await Promise.all([getCatalog(), getBillingSettings(), getOfferHealth(usageRange("this_month").from), getPriceMoves()]);
  const views = catalog.map((p) => offerView(p, health, settings, moves));

  return (
    <main className={adminPageClass()}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Plans and prices</h1>
          <SettingsLine settings={settings} views={views} />
        </div>
        <OfferDialog
          kind="plan"
          settings={settings}
          trigger={
            <Button>
              <Plus aria-hidden strokeWidth={1.5} />
              Add a plan
            </Button>
          }
        />
      </div>
      <PlansView views={views} health={health} settings={settings} />
    </main>
  );
}
