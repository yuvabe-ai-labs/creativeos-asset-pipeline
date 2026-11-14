import { apiOk, withQuietErrors, withTeam } from "@/lib/api/route-helpers";
import { listAgencyPeople, listOpenInvites } from "@/lib/db/people";
import { hideInviteLinks } from "@/lib/people/utils";

type Ctx = { params: Promise<{ orgId: string }> };

// GET — the agency's people and open invites: the Team page, every Members list and the invite
// popup read this one response (spec §10). Open to the owner and to anyone with Invite on a
// client (their Members page and popup); without manage_team the invite links are withheld.
export async function GET(req: Request, { params }: Ctx) {
  return withTeam(req, params, { need: "invite" }, ({ orgId, canManage }) =>
    withQuietErrors("Could not load the team.", async () => {
      const [people, invites] = await Promise.all([listAgencyPeople(orgId), listOpenInvites(orgId)]);
      return apiOk({ people, invites: canManage ? invites : hideInviteLinks(invites) });
    }),
  );
}
