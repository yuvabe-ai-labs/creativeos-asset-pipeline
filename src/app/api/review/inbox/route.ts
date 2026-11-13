import { listOrgReviewInbox } from "@/lib/db/review";
import { apiOk, withAccess, withTryCatch } from "@/lib/api/route-helpers";
import { parsePageParams } from "@/lib/review/page-params";
import { REVIEWABLE_NODE_TYPES } from "@/lib/review/queue";
import { accessOf } from "@/lib/permissions/server";
import { clientIdsWith } from "@/lib/permissions/check";

// R9.1/R9.5 — "things waiting on you", org-wide.
//
// The user id, review types and clients all come from the session, never from the request, so a
// caller cannot widen their own list into someone else's. Pending work is listed only on the
// clients where the person holds Approve (the same set the counts use);
// everyone sees their own rejected work, on the clients they can view.
// The rule itself lives in inboxFilterFor / selectInboxFor (pure, proven equivalent in queue.test.ts).
export async function GET(req: Request) {
  const page = parsePageParams(new URL(req.url).searchParams);
  return withAccess(req, { need: "internal_review.view" }, (caller, orgId) =>
    withTryCatch("Failed to load review inbox", async () => {
      const access = accessOf(caller);
      // Pending work only on the clients where the person holds Approve: the set the badge counts.
      const pendingClientIds = clientIdsWith(access, orgId, "approve");
      const approves = pendingClientIds === null || pendingClientIds.length > 0;
      const items = await listOrgReviewInbox(
        orgId,
        caller.userId,
        {
          reviewTypes: approves ? REVIEWABLE_NODE_TYPES : [],
          clientIds: clientIdsWith(access, orgId, "view"),
          pendingClientIds,
        },
        page,
      );
      return apiOk({ items, hasMore: items.length === page.limit });
    }),
  );
}
