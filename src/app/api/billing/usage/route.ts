import { apiError, apiOk, withAccess, withQuietErrors } from "@/lib/api/route-helpers";
import { getUsageOverview } from "@/lib/db/billing-usage";
import { isUsagePeriod } from "@/lib/billing/usage-period";

// The Usage page's numbers for a month (D597), owners only: totals, the daily chart and every
// breakdown, in one read.
export async function GET(req: Request) {
  return withAccess(req, { need: "view_credits" }, (_caller, orgId) =>
    withQuietErrors("Could not load usage.", async () => {
      const period = new URL(req.url).searchParams.get("period") ?? "this_month";
      if (!isUsagePeriod(period)) return apiError("Pick a month.", 400);
      return apiOk(await getUsageOverview(orgId, period));
    }),
  );
}
