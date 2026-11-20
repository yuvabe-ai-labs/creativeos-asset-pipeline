import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { getBillingSettings, getCatalog, getSubscriberCounts } from "@/lib/db/billing-catalog";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { SettingsBar } from "@/components/admin/plans/settings-bar";
import { OffersSection } from "@/components/admin/plans/offers-section";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plans and prices · Admin" };

// Admin › Plans and prices (spec 2026-11-21-plans-and-prices-design.md). Three calls whatever the
// number of agencies: the catalog with its prices, the settings in force, subscribers per price.
// The same width as Agencies, so the section nav doesn't move between the two.
export default async function AdminPlansPage() {
  await requireSuperAdmin();
  const [catalog, settings, counts] = await Promise.all([getCatalog(), getBillingSettings(), getSubscriberCounts()]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
      <AdminSectionNav />
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Plans and prices</h1>
        <p className="text-sm text-muted-foreground">What agencies that pay for a plan can buy. The same for every agency.</p>
      </div>
      <div className="flex flex-col gap-10">
        <SettingsBar settings={settings} />
        <OffersSection kind="plan" products={catalog.filter((p) => p.kind === "plan")} counts={counts} settings={settings} />
        <OffersSection kind="topup" products={catalog.filter((p) => p.kind === "topup")} counts={counts} settings={settings} />
      </div>
    </main>
  );
}
