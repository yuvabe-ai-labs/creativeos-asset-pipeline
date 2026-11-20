import { apiError, apiOk, withAccess, withQuietErrors } from "@/lib/api/route-helpers";
import { startTopUp } from "@/lib/billing/top-ups";

// The owner buys a top-up pack (D522). Answers the Razorpay order for Checkout; credits arrive only
// with the signed order.paid webhook.
export async function POST(req: Request) {
  return withAccess(req, { need: "view_credits" }, (caller, orgId) =>
    withQuietErrors("Could not start the payment.", async () => {
      const body = (await req.json().catch(() => null)) as { priceId?: unknown } | null;
      if (typeof body?.priceId !== "string" || !body.priceId) return apiError("Pick a top-up.", 400);
      const result = await startTopUp(orgId, caller.userId, body.priceId);
      return result.ok ? apiOk(result.value) : apiError(result.error, result.status);
    }),
  );
}
