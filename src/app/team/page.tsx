import { notFound } from "next/navigation";
import { check } from "@/lib/permissions/check";
import { accessOf, resolveActingCaller } from "@/lib/permissions/server";
import { listAgencyPeople, listOpenInvites } from "@/lib/db/people";
import { listClientNames } from "@/lib/db/clients";
import { teamCrumbs } from "@/lib/people/nav";
import { PageCrumbs } from "@/components/shared/page-crumbs";
import { PAGE_CONTAINER } from "@/components/shared/page-header";
import { TeamPeople } from "@/components/team/team-people";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team — CreativeOS" };

// Spec §6.1, owner only (a member gets the 404 page). ?person=<id> opens that person's panel, the
// target of a Members list's "Set permissions" and of the signed-up email. ?from=<client slug>
// (from that Members list) keeps the client's trail in the breadcrumb; it is looked up in the
// agency's client list read here anyway, so an unknown or other agency's slug is just ignored.
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ person?: string; from?: string }> }) {
  const [{ caller, effectiveOrgId }, { person, from }] = await Promise.all([resolveActingCaller(), searchParams]);
  if (check(accessOf(caller), "manage_team", { orgId: effectiveOrgId, clientId: null }) !== "allow") notFound();
  const [people, invites, clients] = await Promise.all([
    listAgencyPeople(effectiveOrgId),
    listOpenInvites(effectiveOrgId),
    listClientNames(effectiveOrgId),
  ]);
  const fromClient = from ? (clients.find((c) => c.slug === from) ?? null) : null;
  return (
    <main className={PAGE_CONTAINER}>
      <TeamPeople
        title="Team"
        breadcrumb={<PageCrumbs items={teamCrumbs(fromClient)} />}
        orgId={effectiveOrgId}
        clients={clients}
        initial={{ people, invites }}
        focusUserId={person ?? null}
      />
    </main>
  );
}
