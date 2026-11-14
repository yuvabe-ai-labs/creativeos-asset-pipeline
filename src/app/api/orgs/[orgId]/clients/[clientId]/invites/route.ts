import { apiError, opResponse, withQuietErrors, withTeam } from "@/lib/api/route-helpers";
import { inviteToClient } from "@/lib/people/ops";
import { InviteSchema } from "@/lib/people/schema";

type Ctx = { params: Promise<{ orgId: string; clientId: string }> };

// POST { email } — "Invite someone new" (spec §6.2), by the owner or anyone with Invite on this
// client: the invite is always for this client (from the URL), and invited_by is the caller. The
// new person signs up and waits as Signed up until the owner gives access.
export async function POST(req: Request, { params }: Ctx) {
  return withTeam(req, params, { need: "invite" }, (ctx) =>
    withQuietErrors("Could not send the invite.", async () => {
      const parsed = InviteSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Enter a valid email.", 400);
      const client = ctx.client!;
      const result = await inviteToClient(ctx, { id: client.id, name: client.name }, parsed.data.email, ctx.actor);
      if (result.ok) await ctx.logAdmin("invite", { clientId: client.id, email: result.value.invite.email });
      return opResponse(result);
    }),
  );
}
