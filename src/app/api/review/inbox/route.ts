import { listOrgReviewInbox } from "@/lib/db/review";
import { apiOk, withAccess, withTryCatch } from "@/lib/api/route-helpers";
import { parsePageParams } from "@/lib/review/page-params";

// R9.1/R9.5 — "things waiting on you", org-wide.
//
// Both the user id and the role come from the session, never from the request, so a caller
// cannot widen their own list into someone else's. The role split itself lives in
// inboxFilterFor / selectInboxFor (pure, and proven equivalent in queue.test.ts).
export async function GET(req: Request) {
  const page = parsePageParams(new URL(req.url).searchParams);
  return withAccess(req, { need: "internal_review.view" }, (caller, orgId) =>
    withTryCatch("Failed to load review inbox", async () => {
      const items = await listOrgReviewInbox(orgId, caller.userId, caller.orgRole, page);
      return apiOk({ items, hasMore: items.length === page.limit });
    }),
  );
}
