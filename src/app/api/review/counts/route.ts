import { getOrgReviewCounts } from "@/lib/db/review";
import { apiOk, withAccess, withTryCatch } from "@/lib/api/route-helpers";
import { accessOf } from "@/lib/permissions/server";

// The refetch target for useReviewCounts (R8.1). List pages seed their counts server-side;
// this exists so a Realtime ping can refresh them without a full navigation.
//
// No org id parameter by design — it is resolved from the session (honouring an active
// impersonation), so a caller cannot ask for another org's counts by editing a query string.
// Counts are of the work the caller can approve, in the clients their access reaches.
export async function GET(req: Request) {
  return withAccess(req, { need: "internal_review.view" }, (caller, orgId) =>
    withTryCatch("Failed to load review counts", async () =>
      apiOk(await getOrgReviewCounts(orgId, accessOf(caller))),
    ),
  );
}
