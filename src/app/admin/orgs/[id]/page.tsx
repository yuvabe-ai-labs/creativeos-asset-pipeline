import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { getOrgById, listOrgMembers } from "@/lib/db/organizations";
import { countGenerationsForOrg, listGenerationsForOrg } from "@/lib/db/generations";
import { OrgDetailTabs } from "./org-detail-tabs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

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
  const [members, generationCount, generations] = await Promise.all([
    listOrgMembers(id),
    countGenerationsForOrg(id),
    listGenerationsForOrg(id),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/admin">Agencies</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{org.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="mb-8 font-display text-2xl font-semibold tracking-tight">
        {org.name}
      </h1>
      <OrgDetailTabs
        org={org}
        members={members}
        generationCount={generationCount}
        generations={generations}
      />
    </main>
  );
}
