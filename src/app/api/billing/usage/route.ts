import { apiError, apiOk, withAccess, withQuietErrors } from "@/lib/api/route-helpers";
import { getUsageBy } from "@/lib/db/billing-usage";
import { isUsageBy, isUsagePeriod, usageRange } from "@/lib/billing/usage-period";

// Who used what (D524), owners only: credits charged in a month per member, client or canvas.
export async function GET(req: Request) {
  return withAccess(req, { need: "view_credits" }, (_caller, orgId) =>
    withQuietErrors("Could not load usage.", async () => {
      const params = new URL(req.url).searchParams;
      const by = params.get("by");
      const period = params.get("period") ?? "this_month";
      if (!isUsageBy(by) || !isUsagePeriod(period)) return apiError("Pick what to group by and a month.", 400);
      const rows = await getUsageBy(orgId, by, usageRange(period));
      return apiOk({ rows, total: rows.reduce((s, r) => s + r.credits, 0) });
    }),
  );
}
