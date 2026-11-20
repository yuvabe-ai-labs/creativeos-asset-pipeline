import { notFound } from "next/navigation";
import { Eye } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import {
  getOrgById,
  getOrgCreditUsage,
  getOrgDailyCreditHistory,
  getOrgMonthlyCreditHistory,
  getOrgYearlyCreditHistory,
  getOrgCreditBreakdownByType,
  getOrgCreditBreakdownByModel,
} from "@/lib/db/organizations";
import { countGenerationsForOrg, listGenerationsForOrgPage } from "@/lib/db/generations";
import { listImpersonationSessionPage } from "@/lib/db/impersonation-audit";
import { listAgencyPeople, listOpenInvites } from "@/lib/db/people";
import { listClientNames } from "@/lib/db/clients";
import { listOpenGrants } from "@/lib/db/credit-grants";
import { listBillingLog } from "@/lib/db/billing-admin";
import { getLiveSubscription } from "@/lib/db/billing-subscriptions";
import { OrgDetailTabs } from "./org-detail-tabs";
import { EnterImpersonationButton } from "./enter-impersonation-button";
import { OrgCrumbs } from "./org-crumbs";
import { PAGE_CONTAINER, PageHeader } from "@/components/shared/page-header";

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
    people,
    invites,
    clients,
    generationCount,
    generationsPage,
    creditsUsedThisMonth,
    dailyHistory,
    monthlyHistory,
    yearlyHistory,
    breakdownByType,
    breakdownByModel,
    impersonationSessions,
    grants,
    billingLog,
    subscription,
  ] = await Promise.all([
    listAgencyPeople(id),
    listOpenInvites(id),
    listClientNames(id),
    countGenerationsForOrg(id),
    listGenerationsForOrgPage(id, { page: 1, pageSize: 20 }),
    getOrgCreditUsage(id),
    getOrgDailyCreditHistory(id),
    getOrgMonthlyCreditHistory(id),
    getOrgYearlyCreditHistory(id),
    getOrgCreditBreakdownByType(id, monthStart, monthEnd),
    getOrgCreditBreakdownByModel(id, monthStart, monthEnd),
    listImpersonationSessionPage(id, { page: 1, pageSize: 20 }),
    listOpenGrants(id),
    listBillingLog(id),
    getLiveSubscription(id),
  ]);

  return (
    <main className={PAGE_CONTAINER}>
      <div className="mb-6">
        <PageHeader
          breadcrumb={<OrgCrumbs org={{ id: org.id, name: org.name }} />}
          title={org.name}
          actions={
            isViewingThisOrg ? (
              // Offering "Enter as this org" while already inside it is the kind of dead
              // control that makes the whole feature feel unresponsive. Exit lives in the
              // banner, so this is a status, not an action.
              <span className="flex items-center gap-1.5 text-sm text-neutral-500">
                <Eye className="size-3.5" strokeWidth={1.5} />
                You&rsquo;re viewing as this org
              </span>
            ) : (
              <EnterImpersonationButton orgId={org.id} orgName={org.name} />
            )
          }
        />
      </div>
      <OrgDetailTabs
        org={org}
        people={people}
        invites={invites}
        clients={clients}
        generationCount={generationCount}
        generationsPage={generationsPage}
        creditsUsedThisMonth={creditsUsedThisMonth}
        dailyHistory={dailyHistory}
        monthlyHistory={monthlyHistory}
        yearlyHistory={yearlyHistory}
        breakdownByType={breakdownByType}
        breakdownByModel={breakdownByModel}
        impersonationSessions={impersonationSessions}
        grants={grants}
        billingLog={billingLog}
        subscription={subscription}
      />
    </main>
  );
}
