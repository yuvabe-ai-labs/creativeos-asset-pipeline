import { apiError, apiOk, withAccess } from "@/lib/api/route-helpers";
import { verifyCheckoutSignature } from "@/lib/billing/razorpay";
import { isBillingTestEnabled } from "@/lib/billing/test-mode";

type ConfirmBody = { orderId?: string; paymentId?: string; signature?: string };

// D514: checks Checkout's signature so the page can say "payment received". It never adds
// credits: a closed tab or a forged call can't change a balance; the webhook does that.
export async function POST(req: Request) {
  if (!isBillingTestEnabled()) return apiError("Not found.", 404);
  return withAccess(req, { need: "view_credits" }, async () => {
    const body = (await req.json().catch(() => null)) as ConfirmBody | null;
    if (!body?.orderId || !body.paymentId || !body.signature) return apiError("Missing payment details.", 400);
    if (!verifyCheckoutSignature(body.orderId, body.paymentId, body.signature)) {
      return apiError("The payment couldn't be confirmed.", 400);
    }
    return apiOk({ received: true });
  });
}
