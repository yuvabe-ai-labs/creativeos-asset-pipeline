import { apiError, apiOk, withAccess } from "@/lib/api/route-helpers";
import { verifySubscriptionSignature } from "@/lib/billing/razorpay";

type ConfirmBody = { paymentId?: unknown; subscriptionId?: unknown; signature?: unknown };

// Checks Checkout's signature so the page can say "payment received" (D580). It never adds
// credits: a closed tab or a forged call can't change a balance; the webhook does that.
export async function POST(req: Request) {
  return withAccess(req, { need: "view_credits" }, async () => {
    const body = (await req.json().catch(() => null)) as ConfirmBody | null;
    const { paymentId, subscriptionId, signature } = body ?? {};
    if (typeof paymentId !== "string" || !paymentId || typeof subscriptionId !== "string" || !subscriptionId || typeof signature !== "string" || !signature) {
      return apiError("Missing payment details.", 400);
    }
    if (!verifySubscriptionSignature(paymentId, subscriptionId, signature)) return apiError("The payment couldn't be confirmed.", 400);
    return apiOk({ received: true });
  });
}
