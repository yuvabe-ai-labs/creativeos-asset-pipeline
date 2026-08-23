import { listOrgReviewInbox } from "@/lib/db/review";
import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { apiOk, withTryCatch } from "@/lib/api/route-helpers";

// R9.1/R9.5 — "things waiting on you", org-wide.
//
// Both the user id and the role come from the session, never from the request, so a caller
// cannot widen their own list into someone else's. The role split itself lives in
// selectInboxFor (pure, unit-tested), not here.
export async function GET() {
  return withTryCatch("Failed to load review inbox", async () => {
    const caller = await resolveCallerContext();
    const orgId = await resolveOrgId();
    return apiOk({
      items: await listOrgReviewInbox(orgId, caller.userId, caller.orgRole),
    });
  });
}
