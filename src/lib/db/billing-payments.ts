import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

/** The order as started; credits are added only when its webhook arrives (D573). A top-up (D581)
 *  also keeps its price, plan, tax, total and the rate in force. */
export async function insertCreatedPayment(row: {
  orgId: string;
  orderId: string;
  amountPaise: number;
  credits: number;
  createdBy: string;
  topUp?: { priceId: string; subscriptionId: string; taxMinor: number; totalMinor: number; inrPerUsd: number | null };
}): Promise<void> {
  const { error } = await createServerSupabase().from("billing_payments").insert({
    org_id: row.orgId,
    razorpay_order_id: row.orderId,
    amount_paise: row.amountPaise,
    credits: row.credits,
    status: "created",
    created_by: row.createdBy,
    ...(row.topUp
      ? {
          kind: "topup",
          price_id: row.topUp.priceId,
          subscription_id: row.topUp.subscriptionId,
          tax_minor: row.topUp.taxMinor,
          total_minor: row.topUp.totalMinor,
          inr_per_usd: row.topUp.inrPerUsd,
        }
      : {}),
  });
  if (error) throw error;
}

/** Migration 0090: marks the order paid and adds its credits, once. False for an unknown or
 *  already-paid order. */
export async function recordRazorpayPayment(orderId: string, paymentId: string): Promise<boolean> {
  const { data, error } = await createServerSupabase().rpc("record_razorpay_payment", {
    p_order_id: orderId,
    p_payment_id: paymentId,
  });
  if (error) throw error;
  return data === true;
}
