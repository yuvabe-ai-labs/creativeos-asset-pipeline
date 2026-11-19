"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirmTestPayment, useCreateTestOrder } from "@/hooks/queries/billing";
import { loadCheckout, openCheckout } from "@/lib/billing/load-checkout";

type Status = { tone: "info" | "ok" | "error"; text: string } | null;

const TONE_CLASS = { info: "text-muted-foreground", ok: "text-foreground", error: "text-destructive-text" } as const;

// D514: one test pack, paid in Razorpay Checkout. Confirm only reports "received"; the webhook
// adds the credits, and the profile popover shows them as they arrive.
export function TestTopUp() {
  const createOrder = useCreateTestOrder();
  const confirm = useConfirmTestPayment();
  const [status, setStatus] = useState<Status>(null);
  const busy = createOrder.isPending || confirm.isPending;

  async function pay() {
    setStatus(null);
    try {
      const [order] = await Promise.all([createOrder.mutateAsync(), loadCheckout()]);
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
              setStatus({ tone: "error", text: "The payment couldn't be confirmed." });
            }
          },
          modal: { ondismiss: () => setStatus((s) => s ?? { tone: "info", text: "Payment window closed. Nothing was charged." }) },
        },
        () => setStatus({ tone: "error", text: "The payment didn't go through. No credits were added." }),
      );
    } catch (e) {
      setStatus({ tone: "error", text: e instanceof Error ? e.message : "Could not start the payment." });
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
          <span className="font-medium">1,000 credits</span>
          <span className="font-medium">₹100</span>
        </div>
        <Button className="w-full" onClick={pay} disabled={busy}>
          <CreditCard strokeWidth={1.5} />
          {busy ? "Starting…" : "Pay ₹100"}
        </Button>
        {status && <p className={`text-sm ${TONE_CLASS[status.tone]}`}>{status.text}</p>}
      </div>
    </div>
  );
}
