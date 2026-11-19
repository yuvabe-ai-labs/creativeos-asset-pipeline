import { apiError, apiOk, withQuietErrors } from "@/lib/api/route-helpers";
import { verifyWebhookSignature } from "@/lib/billing/razorpay";
import { recordRazorpayPayment } from "@/lib/db/billing-payments";

type RazorpayEvent = {
  event?: string;
  payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
};

// D514: the only path that adds credits. No session here (the proxy skips /api/webhooks); the
// signature on the raw body is the check, so the body is read as text before any parsing.
// Answers fast (two database calls) because Razorpay retries anything slower than 5 seconds.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) return apiError("Unauthorized.", 401);

  let body: RazorpayEvent;
  try {
    body = JSON.parse(raw) as RazorpayEvent;
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  if (body.event !== "order.paid") return apiOk({ ignored: true });

  const payment = body.payload?.payment?.entity;
  if (!payment?.id || !payment.order_id) return apiError("Missing payment", 400);
  const { id: paymentId, order_id: orderId } = payment;

  return withQuietErrors("Could not record the payment.", async () => {
    const added = await recordRazorpayPayment(orderId, paymentId);
    if (!added) console.warn("[razorpay] order.paid changed nothing (unknown order or already paid)", orderId);
    return apiOk({ added });
  });
}
