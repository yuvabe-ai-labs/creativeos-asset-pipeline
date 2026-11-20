import { apiError, apiOk, withAccess, withQuietErrors } from "@/lib/api/route-helpers";
import { cancelPlan } from "@/lib/billing/subscriptions";

// The owner cancels the plan: no next charge, no refund; it works until the paid month ends (D521).
export async function POST(req: Request) {
  return withAccess(req, { need: "view_credits" }, (_caller, orgId) =>
    withQuietErrors("Could not cancel the plan.", async () => {
      const result = await cancelPlan(orgId);
      return result.ok ? apiOk(result.value) : apiError(result.error, result.status);
    }),
  );
}
