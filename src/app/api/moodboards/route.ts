import { apiOk } from "@/lib/api/route-helpers";
import { resolveOrgId } from "@/lib/dal";
import { listClientsWithMoodboards } from "@/lib/db/moodboards";

// GET /api/moodboards — the capture extension's picker index.
//
// Shipped open under D14 and returned EVERY active client on the platform, which became
// a cross-org leak the moment orgs existed: the anon-reachable client list of every
// tenant. Now session-scoped — resolveOrgId() throws/redirects without a session (via its
// resolveCallerContext() fallback when not impersonating), and the listing is filtered to
// the effective org — the impersonation target when active, else the caller's own org.
export async function GET() {
  const orgId = await resolveOrgId();
  const clients = await listClientsWithMoodboards(orgId);
  console.log(
    `[clip] GET /api/moodboards org=${orgId} clients=${clients.length} boards=${clients.reduce((n, c) => n + c.boards.length, 0)}`,
  );
  return apiOk({ clients });
}
