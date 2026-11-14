import { apiOk, withQuietErrors, withTeam } from "@/lib/api/route-helpers";
import { listAgencyPeople, listOpenInvites } from "@/lib/db/people";
import { inviteHolderView } from "@/lib/people/utils";
import { clientIdsWith } from "@/lib/permissions/check";
import { accessOf } from "@/lib/permissions/server";

type Ctx = { params: Promise<{ orgId: string }> };

// GET — the agency's people and open invites: the Team page, every Members list and the invite
// popup read this one response (spec §10). Open to the owner and to anyone with Invite on a
// client (their Members page and popup). Without manage_team the read keeps to the clients where
// the caller holds Invite (spec §6.2): no other client's invites or names, no permissions, no links.
export async function GET(req: Request, { params }: Ctx) {
  return withTeam(req, params, { need: "invite" }, ({ orgId, caller, canManage }) =>
    withQuietErrors("Could not load the team.", async () => {
      const [people, invites] = await Promise.all([listAgencyPeople(orgId), listOpenInvites(orgId)]);
      if (canManage) return apiOk({ people, invites });
      // Without manage_team the caller is never the owner, so the set is a list; fail closed anyway.
      const clientIds = clientIdsWith(accessOf(caller), orgId, "invite") ?? [];
      return apiOk(inviteHolderView({ people, invites }, clientIds));
    }),
  );
}
