import { apiOk } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { listClientsWithMoodboards } from "@/lib/db/moodboards";

// GET /api/moodboards — the capture extension's picker index.
//
// Shipped open under D14 and returned EVERY active client on the platform, which became
// a cross-org leak the moment orgs existed: the anon-reachable client list of every
// tenant. Now session-scoped — resolveCallerContext() throws/redirects without a session,
// and the listing is filtered to the caller's org.
export async function GET() {
  const caller = await resolveCallerContext();
  const clients = await listClientsWithMoodboards(caller.orgId);
  return apiOk({ clients });
}
