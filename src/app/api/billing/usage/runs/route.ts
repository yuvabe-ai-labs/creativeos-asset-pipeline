import { apiError, apiOk, withAccess, withQuietErrors } from "@/lib/api/route-helpers";
import { listUsageRuns } from "@/lib/db/billing-usage";
import { isUsageBy, isUsagePeriod, usageRange } from "@/lib/billing/usage-period";
import { pageParam } from "@/lib/billing/usage-page-size";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One group's charged runs (D583), owners only. Every filter is the caller's own agency, so a key
// from another agency finds nothing.
export async function GET(req: Request) {
  return withAccess(req, { need: "view_credits" }, (_caller, orgId) =>
    withQuietErrors("Could not load the runs.", async () => {
      const params = new URL(req.url).searchParams;
      const by = params.get("by");
      const period = params.get("period") ?? "this_month";
      const key = params.get("key") || null;
      const page = pageParam(params.get("page"));
      if (!isUsageBy(by) || !isUsagePeriod(period) || (key !== null && !UUID.test(key))) return apiError("Pick a group and a month.", 400);
      return apiOk(await listUsageRuns(orgId, by, key, usageRange(period), page));
    }),
  );
}
