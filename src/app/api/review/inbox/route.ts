import { listOrgReviewInbox } from "@/lib/db/review";
import { apiOk, withAccess, withTryCatch } from "@/lib/api/route-helpers";
import { parsePageParams } from "@/lib/review/page-params";
import { accessOf } from "@/lib/permissions/server";
import { scopeIds } from "@/lib/permissions/check";
import { reviewableNodeTypes } from "@/lib/permissions/node-area";

// R9.1/R9.5 — "things waiting on you", org-wide.
//
// The user id, review types and client scope all come from the session, never from the
// request (D496), so a caller cannot widen their own list into someone else's. The rule
// itself lives in inboxFilterFor / selectInboxFor (pure, and proven equivalent in queue.test.ts).
export async function GET(req: Request) {
  const page = parsePageParams(new URL(req.url).searchParams);
  return withAccess(req, { need: "internal_review.view" }, (caller, orgId) =>
    withTryCatch("Failed to load review inbox", async () => {
      const access = accessOf(caller);
      const items = await listOrgReviewInbox(
        orgId,
        caller.userId,
        { reviewTypes: reviewableNodeTypes(access), clientIds: scopeIds(access) },
        page,
      );
      return apiOk({ items, hasMore: items.length === page.limit });
    }),
  );
}
