import { apiError, opResponse, withQuietErrors, withTeam } from "@/lib/api/route-helpers";
import { addToClient } from "@/lib/people/ops";
import { AddMembersSchema } from "@/lib/people/schema";

type Ctx = { params: Promise<{ orgId: string; clientId: string }> };

// POST { userIds } — "Add n people" in the invite popup's first step (spec §6.2), by the owner or
// anyone with Invite on this client (the client from the URL, never the body). The ids are
// checked to be people in this agency before one insert; each row copies the person's agency set.
export async function POST(req: Request, { params }: Ctx) {
  return withTeam(req, params, { need: "invite" }, (ctx) =>
    withQuietErrors("Could not add them.", async () => {
      const parsed = AddMembersSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Choose people from the list.", 400);
      const client = ctx.client!;
      const result = await addToClient(ctx, client.id, parsed.data.userIds, ctx.actor);
      if (result.ok) await ctx.logAdmin("add_to_client", { clientId: client.id, userIds: parsed.data.userIds });
      return opResponse(result);
    }),
  );
}
