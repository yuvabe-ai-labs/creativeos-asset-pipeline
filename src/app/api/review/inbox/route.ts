import { listOrgReviewInbox } from "@/lib/db/review";
import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { apiOk, withTryCatch } from "@/lib/api/route-helpers";
import { parsePageParams } from "@/lib/review/page-params";

// R9.1/R9.5 — "things waiting on you", org-wide.
//
// Both the user id and the role come from the session, never from the request, so a caller
// cannot widen their own list into someone else's. The role split itself lives in
// inboxFilterFor / selectInboxFor (pure, and proven equivalent in queue.test.ts).
export async function GET(req: Request) {
  const page = parsePageParams(new URL(req.url).searchParams);
  return withTryCatch("Failed to load review inbox", async () => {
    const caller = await resolveCallerContext();
    const orgId = await resolveOrgId();
    const items = await listOrgReviewInbox(orgId, caller.userId, caller.orgRole, page);
    return apiOk({ items, hasMore: items.length === page.limit });
  });
}
