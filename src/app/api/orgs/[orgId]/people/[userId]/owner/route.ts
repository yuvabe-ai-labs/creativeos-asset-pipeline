import { apiError, opResponse, withQuietErrors, withTeam } from "@/lib/api/route-helpers";
import { makeOwner } from "@/lib/people/ops";

type Ctx = { params: Promise<{ orgId: string; userId: string }> };

// POST — Make owner (spec §6.6): only the super admin moves ownership; the previous owner becomes
// a member with all five permissions on every client.
export async function POST(req: Request, { params }: Ctx) {
  const { userId } = await params;
  return withTeam(req, params, { need: "manage_team" }, (ctx) =>
    withQuietErrors("Could not change the owner.", async () => {
      if (ctx.caller.platformRole !== "super_admin") return apiError("Not found.", 404);
      const result = await makeOwner(ctx, userId);
      if (result.ok) await ctx.logAdmin("make_owner", { userId });
      return opResponse(result);
    }),
  );
}
