import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { NewOrgForm } from "./new-org-form";

export const metadata = { title: "New organization — Admin" };

export default async function NewOrgPage() {
  await requireSuperAdmin();
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-6 py-14">
      <h1 className="mb-8 font-display text-2xl font-semibold tracking-tight">
        New organization
      </h1>
      <NewOrgForm />
    </main>
  );
}
