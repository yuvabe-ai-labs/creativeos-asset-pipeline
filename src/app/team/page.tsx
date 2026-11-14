import { notFound } from "next/navigation";
import { check } from "@/lib/permissions/check";
import { accessOf, resolveActingCaller } from "@/lib/permissions/server";
import { listAgencyPeople, listOpenInvites } from "@/lib/db/people";
import { listClientNames } from "@/lib/db/clients";
import { TeamPeople } from "@/components/team/team-people";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team — CreativeOS" };

// Spec §6.1, owner only (a member gets the 404 page). ?person=<id> highlights that person, the
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
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="font-display mb-8 text-2xl font-semibold tracking-tight">Team</h1>
      <TeamPeople
        orgId={effectiveOrgId}
        clients={clients}
        initial={{ people, invites }}
        focusUserId={person ?? null}
      />
    </main>
  );
}
