import { apiError, apiOk, withAccess, withQuietErrors } from "@/lib/api/route-helpers";
import { TEST_PACK } from "@/lib/billing/constants";
import { createOrder, razorpayKeyId } from "@/lib/billing/razorpay";
import { isBillingTestEnabled } from "@/lib/billing/test-mode";
import { insertCreatedPayment } from "@/lib/db/billing-payments";

// D514: starts a test payment for the owner's agency. The amount and credits come from TEST_PACK,
// never from the browser. Credits are added only by the webhook.
export async function POST(req: Request) {
  if (!isBillingTestEnabled()) return apiError("Not found.", 404);
  return withAccess(req, { need: "view_credits" }, (caller, orgId) =>
    withQuietErrors("Could not start the payment.", async () => {
      const order = await createOrder({
        amountPaise: TEST_PACK.amountPaise,
        receipt: `test-${Date.now()}`,
        notes: { org_id: orgId },
      });
      await insertCreatedPayment({
        orgId,
        orderId: order.id,
        amountPaise: TEST_PACK.amountPaise,
        credits: TEST_PACK.credits,
        createdBy: caller.userId,
      });
      return apiOk({ orderId: order.id, amountPaise: TEST_PACK.amountPaise, credits: TEST_PACK.credits, keyId: razorpayKeyId() });
    }),
  );
}
