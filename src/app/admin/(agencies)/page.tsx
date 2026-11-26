import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { listAgencySources } from "@/lib/db/admin-agencies";
import { toAgencyRow } from "@/lib/admin/agencies-list";
import { AgenciesTable } from "@/components/admin/agencies/agencies-table";
import { AddAgencyDialog } from "@/components/admin/add-agency-dialog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agencies — Admin" };

// One `now` for every row, so each "N days ago" is worked out once, here.
export default async function AdminOrgsPage() {
  await requireSuperAdmin();
  const now = new Date();
  const rows = (await listAgencySources(now)).map((a) => toAgencyRow(a, now));

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Agencies</h1>
        <AddAgencyDialog />
      </div>
      <AgenciesTable rows={rows} />
    </main>
  );
}
