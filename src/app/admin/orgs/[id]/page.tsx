import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { getOrgById, listOrgMembers } from "@/lib/db/organizations";
import { CreditLimitEditor } from "./credit-limit-editor";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const org = await getOrgById(id);
  if (!org) notFound();
  const members = await listOrgMembers(id);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-14">
      <h1 className="mb-1 font-display text-2xl font-semibold tracking-tight">
        {org.name}
      </h1>
      <p className="mb-8 text-xs text-muted-foreground">/{org.slug}</p>

      <Card className="mb-6 p-6 shadow-card">
        <h2 className="text-eyebrow mb-3">Monthly credit limit</h2>
        <CreditLimitEditor orgId={org.id} initial={org.monthly_credit_limit} />
      </Card>

      <Card className="p-6 shadow-card">
        <h2 className="text-eyebrow mb-3">Members</h2>
        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between text-sm">
              <span>{m.display_name}</span>
              <span className="text-muted-foreground">{m.org_role}</span>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
