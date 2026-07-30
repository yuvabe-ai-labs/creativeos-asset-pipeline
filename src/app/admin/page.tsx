import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { listOrgsWithClientCount } from "@/lib/db/organizations";
import { OrgsTable } from "@/components/admin/orgs-table";
import { NewOrgDialog } from "@/components/admin/new-org-dialog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agencies — Admin" };

export default async function AdminOrgsPage() {
  await requireSuperAdmin();
  const orgs = await listOrgsWithClientCount();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Agencies
        </h1>
        <NewOrgDialog />
      </div>
      <OrgsTable orgs={orgs} />
    </main>
  );
}
