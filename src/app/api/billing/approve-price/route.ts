import { apiError, apiOk, withAccess, withQuietErrors } from "@/lib/api/route-helpers";
import { approveNewPrice } from "@/lib/billing/subscriptions";

// The owner approves a new plan price their way of paying can't move to (D595). Answers the new
// subscription for Checkout, which authorises it; the signed subscription.authenticated webhook
// records the approval, and its first charge on the plan's end date makes it the plan.
export async function POST(req: Request) {
  return withAccess(req, { need: "view_credits" }, (_caller, orgId) =>
    withQuietErrors("Could not start the approval.", async () => {
      const result = await approveNewPrice(orgId);
      return result.ok ? apiOk(result.value) : apiError(result.error, result.status);
    }),
  );
}
