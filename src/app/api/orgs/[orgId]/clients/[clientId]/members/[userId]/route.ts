import { opResponse, withQuietErrors, withTeam } from "@/lib/api/route-helpers";
import { removeFromClient } from "@/lib/people/ops";

type Ctx = { params: Promise<{ orgId: string; clientId: string; userId: string }> };

// DELETE — off this client only; they keep the agency, their other clients and their permissions.
// Owner only (manage_team), not Invite holders.
export async function DELETE(req: Request, { params }: Ctx) {
  const { userId } = await params;
  return withTeam(req, params, { need: "manage_team" }, (ctx) =>
    withQuietErrors("Could not remove them from this client.", async () => {
      const client = ctx.client!;
      const result = await removeFromClient(ctx, client.id, userId);
      if (result.ok) await ctx.logAdmin("remove_from_client", { clientId: client.id, userId });
      return opResponse(result);
    }),
  );
}
