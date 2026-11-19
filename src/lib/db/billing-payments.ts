import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

/** The order as started; credits are added only when its webhook arrives (D514). */
export async function insertCreatedPayment(row: {
  orgId: string;
  orderId: string;
  amountPaise: number;
  credits: number;
  createdBy: string;
}): Promise<void> {
  const { error } = await createServerSupabase().from("billing_payments").insert({
    org_id: row.orgId,
    razorpay_order_id: row.orderId,
    amount_paise: row.amountPaise,
    credits: row.credits,
    status: "created",
    created_by: row.createdBy,
  });
  if (error) throw error;
}

/** Migration 0066: marks the order paid and adds its credits, once. False for an unknown or
 *  already-paid order. */
export async function recordRazorpayPayment(orderId: string, paymentId: string): Promise<boolean> {
  const { data, error } = await createServerSupabase().rpc("record_razorpay_payment", {
    p_order_id: orderId,
    p_payment_id: paymentId,
  });
  if (error) throw error;
  return data === true;
}
