import "server-only";
import { getOrgById } from "@/lib/db/organizations";
import { getLiveSubscription, getPurchasablePrice } from "@/lib/db/billing-subscriptions";
import { getBillingSettings } from "@/lib/db/billing-catalog";
import { insertCreatedPayment } from "@/lib/db/billing-payments";
import { createOrder, razorpayKeyId } from "./razorpay";
import { withGst } from "./gst";
import type { StepResult } from "./subscriptions";

// The owner buys a top-up pack (spec 2026-11-21-top-ups-design.md, D581). Answers the Razorpay
// order for Checkout; the credits come only with the signed order.paid webhook.

const refuse = (status: 400 | 404 | 409, error: string) => ({ ok: false as const, status, error });

export async function startTopUp(
  orgId: string,
  userId: string,
  priceId: string,
): Promise<StepResult<{ orderId: string; amountPaise: number; credits: number; keyId: string; name: string }>> {
  const [org, price, live, settings] = await Promise.all([getOrgById(orgId), getPurchasablePrice(priceId), getLiveSubscription(orgId), getBillingSettings()]);
  if (!org) return refuse(404, "Agency not found.");
  if (org.billing_mode !== "plans") return refuse(409, "Your agency's credits are looked after by Yuvabe.");

  const planRunning =
    live && (live.status === "active" || live.status === "cancelling") && live.currentPeriodEnd !== null && new Date(live.currentPeriodEnd) > new Date();
  if (!live || !planRunning) return refuse(409, "Top-ups need an active plan.");

  if (!price || price.product.kind !== "topup" || price.intervalMonths !== null || !price.active || !price.product.active) {
    return refuse(400, "That top-up isn't available.");
  }
  if (price.product.orgId !== null && price.product.orgId !== orgId) return refuse(400, "That top-up isn't available.");

  const totalMinor = withGst(price.amountMinor);
  const credits = Math.ceil(price.credits);
  const order = await createOrder({ amountPaise: totalMinor, receipt: `topup-${Date.now()}`, notes: { org_id: orgId, price_id: price.id } });
  await insertCreatedPayment({
    orgId,
    orderId: order.id,
    amountPaise: price.amountMinor,
    credits,
    createdBy: userId,
    topUp: { priceId: price.id, subscriptionId: live.id, taxMinor: totalMinor - price.amountMinor, totalMinor, inrPerUsd: settings?.inrPerUsd ?? null },
  });
  return { ok: true, value: { orderId: order.id, amountPaise: totalMinor, credits, keyId: razorpayKeyId(), name: price.product.name } };
}
