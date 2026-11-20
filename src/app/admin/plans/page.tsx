import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { getBillingSettings, getCatalog, getSubscriberCounts } from "@/lib/db/billing-catalog";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { PAGE_CONTAINER, PageHeader } from "@/components/shared/page-header";
import { SettingsCard } from "@/components/admin/plans/settings-card";
import { CatalogSection } from "@/components/admin/plans/catalog-section";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plans and prices · Admin" };

// Admin › Plans and prices (spec 2026-11-21-plans-and-prices-design.md). Three calls whatever the
// number of agencies: the catalog with its prices, the settings in force, subscribers per price.
export default async function AdminPlansPage() {
  await requireSuperAdmin();
  const [catalog, settings, counts] = await Promise.all([getCatalog(), getBillingSettings(), getSubscriberCounts()]);

  return (
    <main className={PAGE_CONTAINER}>
      <AdminSectionNav />
      <div className="mb-8">
        <PageHeader title="Plans and prices" subtitle="The same plans and prices for every agency that pays for a plan." />
      </div>
      <div className="flex flex-col gap-10">
        <SettingsCard settings={settings} />
        <CatalogSection kind="plan" products={catalog.filter((p) => p.kind === "plan")} counts={counts} settings={settings} />
        <CatalogSection kind="topup" products={catalog.filter((p) => p.kind === "topup")} counts={counts} settings={settings} />
      </div>
    </main>
  );
}
