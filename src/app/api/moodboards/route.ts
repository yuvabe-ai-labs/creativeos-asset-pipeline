import { apiOk, withAccess } from "@/lib/api/route-helpers";
import { accessOf } from "@/lib/permissions/server";
import { scopeIds } from "@/lib/permissions/check";
import { listClientsWithMoodboards } from "@/lib/db/moodboards";

// GET /api/moodboards — the capture extension's picker index.
//
// Session-scoped: the listing is filtered to the effective org (the impersonation target when
// active, else the caller's own org) and to the clients the caller's access reaches.
export async function GET(req: Request) {
  return withAccess(req, { need: "moodboards.view" }, async (caller, orgId) => {
    const clients = await listClientsWithMoodboards(orgId, scopeIds(accessOf(caller)));
    console.log(
      `[clip] GET /api/moodboards org=${orgId} clients=${clients.length} boards=${clients.reduce((n, c) => n + c.boards.length, 0)}`,
    );
    return apiOk({ clients });
  });
}
