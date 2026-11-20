import { apiError, apiOk, withQuietErrors } from "@/lib/api/route-helpers";
import { verifyWebhookSignature } from "@/lib/billing/razorpay";
import { eventIdFor, handleRazorpayWebhook, type RazorpayWebhook } from "@/lib/billing/webhook";

// The only path that adds credits (D514, D521). No session here (the proxy skips /api/webhooks);
// the signature on the raw body is the check, so the body is read as text before any parsing.
// Every event is stored once and answered quickly; a failure answers 500 so Razorpay retries.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) return apiError("Unauthorized.", 401);

  let body: RazorpayWebhook;
  try {
    body = JSON.parse(raw) as RazorpayWebhook;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  return withQuietErrors("Could not record the event.", async () => {
    const outcome = await handleRazorpayWebhook(eventIdFor(req.headers.get("x-razorpay-event-id"), body), body);
    return outcome.status === 200 ? apiOk(outcome.body) : apiError(String(outcome.body.error ?? "Could not process the event."), outcome.status);
  });
}
