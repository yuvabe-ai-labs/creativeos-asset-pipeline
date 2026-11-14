import { opResponse, withQuietErrors, withTeam } from "@/lib/api/route-helpers";
import { cancelInvite } from "@/lib/people/ops";

type Ctx = { params: Promise<{ orgId: string; inviteId: string }> };

// DELETE — cancel an open invite (Team page, Members list).
export async function DELETE(req: Request, { params }: Ctx) {
  const { inviteId } = await params;
  return withTeam(req, params, { need: "manage_team" }, (ctx) =>
    withQuietErrors("Could not cancel the invite.", async () => {
      const result = await cancelInvite(ctx, inviteId);
      if (result.ok) await ctx.logAdmin("cancel_invite", { inviteId, email: result.value.email });
      return opResponse(result);
    }),
  );
}
