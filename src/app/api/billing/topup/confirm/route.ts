import { apiError, apiOk, withAccess } from "@/lib/api/route-helpers";
import { verifyCheckoutSignature } from "@/lib/billing/razorpay";

type ConfirmBody = { orderId?: unknown; paymentId?: unknown; signature?: unknown };

// Checks Checkout's signature so the page can say "payment received" (D581). It never adds
// credits: the order.paid webhook does that.
export async function POST(req: Request) {
  return withAccess(req, { need: "view_credits" }, async () => {
    const body = (await req.json().catch(() => null)) as ConfirmBody | null;
    const { orderId, paymentId, signature } = body ?? {};
    if (typeof orderId !== "string" || !orderId || typeof paymentId !== "string" || !paymentId || typeof signature !== "string" || !signature) {
      return apiError("Missing payment details.", 400);
    }
    if (!verifyCheckoutSignature(orderId, paymentId, signature)) return apiError("The payment couldn't be confirmed.", 400);
    return apiOk({ received: true });
  });
}
