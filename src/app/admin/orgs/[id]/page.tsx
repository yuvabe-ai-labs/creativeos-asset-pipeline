import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { getOrgById, listOrgMembers } from "@/lib/db/organizations";
import { countGenerationsForOrg } from "@/lib/db/generations";
import { OrgDetailTabs } from "./org-detail-tabs";

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
  const [members, generationCount] = await Promise.all([
    listOrgMembers(id),
    countGenerationsForOrg(id),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
      <h1 className="mb-8 font-display text-2xl font-semibold tracking-tight">
        {org.name}
      </h1>
      <OrgDetailTabs org={org} members={members} generationCount={generationCount} />
    </main>
  );
}
