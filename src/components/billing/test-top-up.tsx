"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirmTestPayment, useCreateTestOrder } from "@/hooks/queries/billing";
import { TEST_PACK } from "@/lib/billing/constants";
import { CHECKOUT_LOAD_FAILED, loadCheckout, openCheckout } from "@/lib/billing/load-checkout";
import { ApiError } from "@/services/read-json";

type Status = { tone: "info" | "ok" | "error"; text: string } | null;

const TONE_CLASS = { info: "text-muted-foreground", ok: "text-foreground", error: "text-destructive-text" } as const;

// D514: one test pack, paid in Razorpay Checkout. Confirm only reports "received"; the webhook
// adds the credits, and the profile popover shows them as they arrive.
export function TestTopUp() {
  const createOrder = useCreateTestOrder();
  const confirm = useConfirmTestPayment();
  const [status, setStatus] = useState<Status>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const busy = createOrder.isPending || confirm.isPending || checkoutOpen;

  async function pay() {
    setStatus(null);
    try {
      const [order] = await Promise.all([createOrder.mutateAsync(), loadCheckout()]);
      setCheckoutOpen(true);
      openCheckout(
        {
          key: order.keyId,
          order_id: order.orderId,
          amount: order.amountPaise,
          currency: "INR",
          name: "CreativeOS",
          description: `${order.credits.toLocaleString("en-IN")} credits (test)`,
          handler: async (r) => {
            try {
              await confirm.mutateAsync({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
              setStatus({ tone: "ok", text: "Payment received. The credits are added as soon as it's confirmed." });
            } catch {
              setStatus({ tone: "error", text: "We couldn't confirm the payment here. If you were charged, the credits are still added once it's confirmed." });
            } finally {
              setCheckoutOpen(false);
            }
          },
          modal: {
            ondismiss: () => {
              setCheckoutOpen(false);
              setStatus((s) => s ?? { tone: "info", text: "Payment window closed. Nothing was charged." });
            },
          },
        },
        // The window stays open after a failed attempt so it can be retried there; Pay stays
        // disabled until the window closes (ondismiss).
        () => setStatus({ tone: "error", text: "The payment didn't go through. No credits were added." }),
      );
    } catch (e) {
      setCheckoutOpen(false);
      const ours = e instanceof ApiError || (e instanceof Error && e.message === CHECKOUT_LOAD_FAILED);
      setStatus({ tone: "error", text: ours ? (e as Error).message : "Could not start the payment." });
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-2">
        <p className="text-eyebrow">Test mode</p>
        <h1 className="font-display text-2xl font-semibold">Buy credits</h1>
        <p className="text-sm text-muted-foreground">A test payment. No real money is taken.</p>
      </div>
      <div className="space-y-4 rounded-xl border bg-card p-6 shadow-card">
        <div className="flex items-baseline justify-between">
          <span className="font-medium">{TEST_PACK.credits.toLocaleString("en-IN")} credits</span>
          <span className="font-medium">₹{TEST_PACK.amountPaise / 100}</span>
        </div>
        <Button className="w-full" onClick={pay} disabled={busy}>
          <CreditCard strokeWidth={1.5} />
          {createOrder.isPending ? "Starting…" : `Pay ₹${TEST_PACK.amountPaise / 100}`}
        </Button>
        {status && <p className={`text-sm ${TONE_CLASS[status.tone]}`}>{status.text}</p>}
      </div>
    </div>
  );
}
