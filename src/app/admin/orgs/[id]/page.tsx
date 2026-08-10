import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import {
  getOrgById,
  listOrgMembers,
  getOrgCreditUsage,
  getOrgDailyCreditHistory,
  getOrgMonthlyCreditHistory,
  getOrgYearlyCreditHistory,
  getOrgCreditBreakdownByType,
  getOrgCreditBreakdownByModel,
} from "@/lib/db/organizations";
import { countGenerationsForOrg, listGenerationsForOrgPage } from "@/lib/db/generations";
import { listImpersonationSessionPage } from "@/lib/db/impersonation-audit";
import { OrgDetailTabs } from "./org-detail-tabs";
import { EnterImpersonationButton } from "./enter-impersonation-button";
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

  const impersonation = await resolveImpersonationState();
  const isViewingThisOrg =
    impersonation.isImpersonating && impersonation.targetOrgId === org.id;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

  const [
    members,
    generationCount,
    generationsPage,
    creditsUsedThisMonth,
    dailyHistory,
    monthlyHistory,
    yearlyHistory,
    breakdownByType,
    breakdownByModel,
    impersonationSessions,
  ] = await Promise.all([
    listOrgMembers(id),
    countGenerationsForOrg(id),
    listGenerationsForOrgPage(id, { page: 1, pageSize: 20 }),
    getOrgCreditUsage(id),
    getOrgDailyCreditHistory(id),
    getOrgMonthlyCreditHistory(id),
    getOrgYearlyCreditHistory(id),
    getOrgCreditBreakdownByType(id, monthStart, monthEnd),
    getOrgCreditBreakdownByModel(id, monthStart, monthEnd),
    listImpersonationSessionPage(id, { page: 1, pageSize: 20 }),
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
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {org.name}
        </h1>
        {isViewingThisOrg ? (
          // Offering "Enter as this org" while already inside it is the kind of dead
          // control that makes the whole feature feel unresponsive. Exit lives in the
          // banner, so this is a status, not an action.
          <span className="flex items-center gap-1.5 text-sm text-neutral-500">
            <Eye className="size-3.5" strokeWidth={1.5} />
            You&rsquo;re viewing as this org
          </span>
        ) : (
          <EnterImpersonationButton orgId={org.id} orgName={org.name} />
        )}
      </div>
      <OrgDetailTabs
        org={org}
        members={members}
        generationCount={generationCount}
        generationsPage={generationsPage}
        creditsUsedThisMonth={creditsUsedThisMonth}
        dailyHistory={dailyHistory}
        monthlyHistory={monthlyHistory}
        yearlyHistory={yearlyHistory}
        breakdownByType={breakdownByType}
        breakdownByModel={breakdownByModel}
        impersonationSessions={impersonationSessions}
      />
    </main>
  );
}
