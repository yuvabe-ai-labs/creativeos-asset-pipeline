import { opResponse, withQuietErrors, withTeam } from "@/lib/api/route-helpers";
import { resendInvite } from "@/lib/people/ops";

type Ctx = { params: Promise<{ orgId: string; inviteId: string }> };

// POST — Resend: a new token, so the old link stops working, and the new link emailed. (Copy link
// needs no route: each open invite in the people list carries its stored link.)
export async function POST(req: Request, { params }: Ctx) {
  const { inviteId } = await params;
  return withTeam(req, params, { need: "manage_team" }, (ctx) =>
    withQuietErrors("Could not send the invite.", async () => {
      const result = await resendInvite(ctx, inviteId, ctx.actor);
      if (result.ok) await ctx.logAdmin("resend_invite", { inviteId, email: result.value.invite.email });
      return opResponse(result);
    }),
  );
}
