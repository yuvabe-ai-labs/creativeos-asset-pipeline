import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { listAgencySources } from "@/lib/db/admin-agencies";
import { toAgencyRow } from "@/lib/admin/agencies-list";
import { AgenciesTable } from "@/components/admin/agencies/agencies-table";
import { AddAgencyDialog } from "@/components/admin/add-agency-dialog";
import { adminPageClass } from "@/components/admin/admin-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agencies — Admin" };

// One `now` for every row, so each "N days ago" is worked out once, here.
export default async function AdminOrgsPage() {
  await requireSuperAdmin();
  const now = new Date();
  const rows = (await listAgencySources(now)).map((a) => toAgencyRow(a, now));

  return (
    <main className={adminPageClass()}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Agencies</h1>
        <AddAgencyDialog />
      </div>
      <AgenciesTable rows={rows} />
    </main>
  );
}
