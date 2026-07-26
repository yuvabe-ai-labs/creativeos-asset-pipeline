import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import {
  getOrgById,
  listOrgMembers,
  getOrgCreditUsage,
  getOrgMonthlyCreditHistory,
  getOrgCreditBreakdownByType,
  getOrgCreditBreakdownByModel,
} from "@/lib/db/organizations";
import { countGenerationsForOrg, listGenerationsForOrgPage } from "@/lib/db/generations";
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

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

  const [
    members,
    generationCount,
    generationsPage,
    creditsUsedThisMonth,
    monthlyHistory,
    breakdownByType,
    breakdownByModel,
  ] = await Promise.all([
    listOrgMembers(id),
    countGenerationsForOrg(id),
    listGenerationsForOrgPage(id, { page: 1, pageSize: 20 }),
    getOrgCreditUsage(id),
    getOrgMonthlyCreditHistory(id),
    getOrgCreditBreakdownByType(id, monthStart, monthEnd),
    getOrgCreditBreakdownByModel(id, monthStart, monthEnd),
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
        generationsPage={generationsPage}
        creditsUsedThisMonth={creditsUsedThisMonth}
        monthlyHistory={monthlyHistory}
        breakdownByType={breakdownByType}
        breakdownByModel={breakdownByModel}
      />
    </main>
  );
}
