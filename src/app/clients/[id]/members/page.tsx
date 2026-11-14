import Link from "next/link";
import { loadClientPage } from "@/lib/permissions/page";
import { check } from "@/lib/permissions/check";
import { accessOf } from "@/lib/permissions/server";
import { listAgencyPeople, listOpenInvites } from "@/lib/db/people";
import { peopleReadFor } from "@/lib/people/utils";
import { ClientMembers } from "@/components/team/client-members";
import { InviteDialog } from "@/components/team/invite-dialog";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const dynamic = "force-dynamic";
export const metadata = { title: "Members — CreativeOS" };

// Spec §6.2: the owner and anyone with Invite on this client. loadClientPage answers the 404 page
// to anyone else (not on the client, or on it without Invite). Owner-only actions follow
// manage_team; without it the first paint gets the same trimmed read the people route answers
// (peopleReadFor: their clients only, no permissions, no invite links), so the cached list
// never holds more than a refetch would.
export default async function ClientMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client, caller, effectiveOrgId } = await loadClientPage(id, "invite");
  const access = accessOf(caller);
  const canManage = check(access, "manage_team", { orgId: effectiveOrgId, clientId: null }) === "allow";
  const [people, invites] = await Promise.all([listAgencyPeople(effectiveOrgId), listOpenInvites(effectiveOrgId)]);
  const initial = peopleReadFor({ people, invites }, { canManage, access, orgId: effectiveOrgId });
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink render={<Link href="/">Clients</Link>} /></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink render={<Link href={`/clients/${client.slug}`}>{client.name}</Link>} /></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Members</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="font-display mb-8 text-2xl font-semibold tracking-tight">Members</h1>
      <ClientMembers
        orgId={effectiveOrgId}
        client={{ id: client.id, name: client.name }}
        initial={initial}
        canManage={canManage}
        inviteSlot={<InviteDialog orgId={effectiveOrgId} client={{ id: client.id, name: client.name }} canManage={canManage} />}
      />
    </main>
  );
}
