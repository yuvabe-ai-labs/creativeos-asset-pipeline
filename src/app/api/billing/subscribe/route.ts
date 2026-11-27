import { apiError, apiOk, withAccess, withQuietErrors } from "@/lib/api/route-helpers";
import { startSubscription } from "@/lib/billing/subscriptions";

// The owner subscribes to a monthly plan (D580). Answers the Razorpay subscription for Checkout;
// credits arrive only with the signed subscription.charged webhook.
export async function POST(req: Request) {
  return withAccess(req, { need: "view_credits" }, (_caller, orgId) =>
    withQuietErrors("Could not start the plan.", async () => {
      const body = (await req.json().catch(() => null)) as { priceId?: unknown } | null;
      if (typeof body?.priceId !== "string" || !body.priceId) return apiError("Pick a plan.", 400);
      const result = await startSubscription(orgId, body.priceId);
      return result.ok ? apiOk(result.value) : apiError(result.error, result.status);
    }),
  );
}
