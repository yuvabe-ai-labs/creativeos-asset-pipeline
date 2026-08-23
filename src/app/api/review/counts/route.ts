import { getOrgReviewCounts } from "@/lib/db/review";
import { resolveOrgId } from "@/lib/dal";
import { apiOk, withTryCatch } from "@/lib/api/route-helpers";

// The refetch target for useReviewCounts (R8.1). List pages seed their counts server-side;
// this exists so a Realtime ping can refresh them without a full navigation.
//
// No org id parameter by design — it is resolved from the session (honouring an active
// impersonation via resolveOrgId), so a caller cannot ask for another org's counts by
// editing a query string.
export async function GET() {
  return withTryCatch("Failed to load review counts", async () => {
    const orgId = await resolveOrgId();
    return apiOk(await getOrgReviewCounts(orgId));
  });
}
