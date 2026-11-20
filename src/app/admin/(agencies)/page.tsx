import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { listOrgsWithClientCount } from "@/lib/db/organizations";
import { OrgsTable } from "@/components/admin/orgs-table";
import { AddAgencyDialog } from "@/components/admin/add-agency-dialog";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agencies — Admin" };

export default async function AdminOrgsPage() {
  await requireSuperAdmin();
  const orgs = await listOrgsWithClientCount();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
      <AdminSectionNav />
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Agencies
        </h1>
        <AddAgencyDialog />
      </div>
      <OrgsTable orgs={orgs} />
    </main>
  );
}
