"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApproveNewPrice, useConfirmSubscription, useConfirmTopUp, useStartTopUp, useSubscribe } from "@/hooks/queries/billing";
import { approvedText } from "@/lib/billing/price-approval-copy";
import { CHECKOUT_LOAD_FAILED, loadCheckout, openCheckout, type CheckoutSuccess, type SubscriptionCheckoutSuccess } from "@/lib/billing/load-checkout";
import { ApiError } from "@/services/read-json";

// The two payment flows in Razorpay Checkout (D580, D581), shared by every screen that buys: start
// on the server, open Checkout, confirm the signature, refresh the page. Credits only ever arrive
// with the signed webhook, so success says "received", never "added".

export type CheckoutStatus = { tone: "info" | "ok" | "error"; text: string } | null;

const RECEIVED = "Payment received. Your credits are added as soon as it's confirmed, usually within a minute.";
const NOT_CONFIRMED = "We couldn't confirm the payment here. If you were charged, your credits are still added once it's confirmed.";
const CLOSED = "Payment window closed. Nothing was charged.";

function plainError(e: unknown, fallback: string): string {
  const ours = e instanceof ApiError || (e instanceof Error && e.message === CHECKOUT_LOAD_FAILED);
  return ours ? (e as Error).message : fallback;
}

export function useBillingCheckout() {
  const router = useRouter();
  const subscribe = useSubscribe();
  const confirmSubscription = useConfirmSubscription();
  const startTopUp = useStartTopUp();
  const confirmTopUp = useConfirmTopUp();
  const approve = useApproveNewPrice();
  const [status, setStatus] = useState<CheckoutStatus>(null);
  const [open, setOpen] = useState(false);
  const busy = open || subscribe.isPending || confirmSubscription.isPending || startTopUp.isPending || confirmTopUp.isPending || approve.isPending;

  const dismiss = () => {
    setOpen(false);
    setStatus((s) => s ?? { tone: "info", text: CLOSED });
  };

  /** Subscribe to a monthly plan. */
  async function buyPlan(priceId: string, label: string) {
    setStatus(null);
    try {
      const [started] = await Promise.all([subscribe.mutateAsync(priceId), loadCheckout()]);
      setOpen(true);
      openCheckout(
        {
          key: started.keyId,
          subscription_id: started.subscriptionId,
          name: "CreativeOS",
          description: `${label}, monthly`,
          handler: async (r: SubscriptionCheckoutSuccess) => {
            try {
              await confirmSubscription.mutateAsync({ subscriptionId: r.razorpay_subscription_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
              setStatus({ tone: "ok", text: RECEIVED });
            } catch {
              setStatus({ tone: "error", text: NOT_CONFIRMED });
            } finally {
              setOpen(false);
              router.refresh();
            }
          },
          modal: { ondismiss: dismiss },
        },
        () => setStatus({ tone: "error", text: "The payment didn't go through. Try again or use another method." }),
      );
    } catch (e) {
      setOpen(false);
      setStatus({ tone: "error", text: plainError(e, "Could not start the plan.") });
    }
  }

  /** Buy a top-up pack. */
  async function buyTopUp(priceId: string) {
    setStatus(null);
    try {
      const [order] = await Promise.all([startTopUp.mutateAsync(priceId), loadCheckout()]);
      setOpen(true);
      openCheckout(
        {
          key: order.keyId,
          order_id: order.orderId,
          amount: order.amountPaise,
          currency: "INR",
          name: "CreativeOS",
          description: order.name,
          handler: async (r: CheckoutSuccess) => {
            try {
              await confirmTopUp.mutateAsync({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
              setStatus({ tone: "ok", text: RECEIVED });
            } catch {
              setStatus({ tone: "error", text: NOT_CONFIRMED });
            } finally {
              setOpen(false);
              router.refresh();
            }
          },
          modal: { ondismiss: dismiss },
        },
        () => setStatus({ tone: "error", text: "The payment didn't go through. No credits were added." }),
      );
    } catch (e) {
      setOpen(false);
      setStatus({ tone: "error", text: plainError(e, "Could not start the payment.") });
    }
  }

  /** Approve a new price (D595): Checkout authorises the new subscription with a small refunded
   *  check; the first payment is on the day it starts. `amountMinor` is the new price before GST. */
  async function approvePrice(amountMinor: number) {
    setStatus(null);
    try {
      const [started] = await Promise.all([approve.mutateAsync(), loadCheckout()]);
      setOpen(true);
      openCheckout(
        {
          key: started.keyId,
          subscription_id: started.subscriptionId,
          name: "CreativeOS",
          description: "Approve the new price",
          handler: async (r: SubscriptionCheckoutSuccess) => {
            try {
              await confirmSubscription.mutateAsync({ subscriptionId: r.razorpay_subscription_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
              setStatus({ tone: "ok", text: approvedText({ amountMinor, startsAt: started.startsAt }) });
            } catch {
              setStatus({ tone: "error", text: "We couldn't confirm the approval here. If it went through, this page shows it within a few minutes." });
            } finally {
              setOpen(false);
              router.refresh();
            }
          },
          modal: { ondismiss: dismiss },
        },
        () => setStatus({ tone: "error", text: "The check didn't go through. Try again or use another method." }),
      );
    } catch (e) {
      setOpen(false);
      setStatus({ tone: "error", text: plainError(e, "Could not start the approval.") });
    }
  }

  return { buyPlan, buyTopUp, approvePrice, busy, status, setStatus };
}
