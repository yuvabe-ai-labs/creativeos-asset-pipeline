import { apiError, opResponse, withQuietErrors, withTeam } from "@/lib/api/route-helpers";
import { removePerson, updatePermissions } from "@/lib/people/ops";
import { UpdatePermissionsSchema } from "@/lib/people/schema";

type Ctx = { params: Promise<{ orgId: string; userId: string }> };

// PATCH { permissions, giveAccess? } — the Team page's editor (spec §6.1). Give access saves the
// set and lets them in; the cascade puts it on every client they are on.
export async function PATCH(req: Request, { params }: Ctx) {
  const { userId } = await params;
  return withTeam(req, params, { need: "manage_team" }, (ctx) =>
    withQuietErrors("Could not save the permissions.", async () => {
      const parsed = UpdatePermissionsSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Choose permissions from the list.", 400);
      const result = await updatePermissions(ctx, userId, parsed.data.permissions, parsed.data.giveAccess ?? false);
      if (result.ok) await ctx.logAdmin(parsed.data.giveAccess ? "give_access" : "set_permissions", { userId, permissions: parsed.data.permissions });
      return opResponse(result);
    }),
  );
}

// DELETE — remove someone waiting, or a member, from the agency.
export async function DELETE(req: Request, { params }: Ctx) {
  const { userId } = await params;
  return withTeam(req, params, { need: "manage_team" }, (ctx) =>
    withQuietErrors("Could not remove them.", async () => {
      const result = await removePerson(ctx, userId);
      if (result.ok) await ctx.logAdmin("remove_person", { userId });
      return opResponse(result);
    }),
  );
}
