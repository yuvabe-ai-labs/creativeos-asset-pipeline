import { notFound } from "next/navigation";
import { check } from "@/lib/permissions/check";
import { accessOf, resolveActingCaller } from "@/lib/permissions/server";
import { listAgencyPeople, listOpenInvites } from "@/lib/db/people";
import { listClientNames } from "@/lib/db/clients";
import { TeamPeople } from "@/components/team/team-people";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team — CreativeOS" };

// Spec §6.1, owner only (a member gets the 404 page). ?person=<id> opens that person's panel, the
// target of a Members list's "Set permissions" and of the signed-up email.
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const [{ caller, effectiveOrgId }, { person }] = await Promise.all([resolveActingCaller(), searchParams]);
  if (check(accessOf(caller), "manage_team", { orgId: effectiveOrgId, clientId: null }) !== "allow") notFound();
  const [people, invites, clients] = await Promise.all([
    listAgencyPeople(effectiveOrgId),
    listOpenInvites(effectiveOrgId),
    listClientNames(effectiveOrgId),
  ]);
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">
      <TeamPeople
        title="Team"
        orgId={effectiveOrgId}
        clients={clients}
        initial={{ people, invites }}
        focusUserId={person ?? null}
      />
    </main>
  );
}
