"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCancelPlan, useChangePlan, useConfirmSubscription, useSubscribe } from "@/hooks/queries/billing";
import { CHECKOUT_LOAD_FAILED, loadCheckout, openCheckout, type SubscriptionCheckoutSuccess } from "@/lib/billing/load-checkout";
import { formatRupees } from "@/lib/billing/pricing";
import { ApiError } from "@/services/read-json";

export type TestPlan = { priceId: string; name: string; amountMinor: number; credits: number };
export type TestSubscription = { status: string; planName: string | null; priceId: string; nextPriceId: string | null; currentPeriodEnd: string | null } | null;

type Status = { tone: "info" | "ok" | "error"; text: string } | null;
const TONE_CLASS = { info: "text-muted-foreground", ok: "text-foreground", error: "text-destructive-text" } as const;
const STATUS_LABEL: Record<string, string> = { created: "Waiting for payment", active: "Active", payment_due: "Payment due", cancelling: "Cancelled, ends with the paid month" };

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null);

// D521, test page only: subscribe to a plan with a test card, then cancel or change it. The plan's
// credits arrive with the signed webhook; Check again re-reads the page.
export function TestPlans({ plans, subscription }: { plans: TestPlan[]; subscription: TestSubscription }) {
  const router = useRouter();
  const subscribe = useSubscribe();
  const confirm = useConfirmSubscription();
  const cancel = useCancelPlan();
  const change = useChangePlan();
  const [status, setStatus] = useState<Status>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const busy = subscribe.isPending || confirm.isPending || cancel.isPending || change.isPending || checkoutOpen;
  const paid = subscription && subscription.status !== "created";

  const fail = (e: unknown, fallback: string) => {
    const ours = e instanceof ApiError || (e instanceof Error && e.message === CHECKOUT_LOAD_FAILED);
    setStatus({ tone: "error", text: ours ? (e as Error).message : fallback });
  };

  async function start(plan: TestPlan) {
    setStatus(null);
    try {
      const [started] = await Promise.all([subscribe.mutateAsync(plan.priceId), loadCheckout()]);
      setCheckoutOpen(true);
      openCheckout(
        {
          key: started.keyId,
          subscription_id: started.subscriptionId,
          name: "CreativeOS",
          description: `${plan.name}, monthly (test)`,
          handler: async (r: SubscriptionCheckoutSuccess) => {
            try {
              await confirm.mutateAsync({ subscriptionId: r.razorpay_subscription_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
              setStatus({ tone: "ok", text: "Payment received. The plan's credits are added as soon as it's confirmed." });
            } catch {
              setStatus({ tone: "error", text: "We couldn't confirm the payment here. If you were charged, the credits are still added once it's confirmed." });
            } finally {
              setCheckoutOpen(false);
              router.refresh();
            }
          },
          modal: { ondismiss: () => { setCheckoutOpen(false); setStatus((s) => s ?? { tone: "info", text: "Payment window closed. Nothing was charged." }); } },
        },
        () => setStatus({ tone: "error", text: "The payment didn't go through." }),
      );
    } catch (e) {
      setCheckoutOpen(false);
      fail(e, "Could not start the plan.");
    }
  }

  async function stop() {
    setStatus(null);
    try {
      const { endsAt } = await cancel.mutateAsync();
      setStatus({ tone: "ok", text: `Cancelled. The plan works until ${day(endsAt) ?? "the paid month ends"}.` });
      router.refresh();
    } catch (e) {
      fail(e, "Could not cancel the plan.");
    }
  }

  async function switchTo(plan: TestPlan) {
    setStatus(null);
    try {
      const { from } = await change.mutateAsync(plan.priceId);
      setStatus({ tone: "ok", text: `${plan.name} starts ${from ? `on ${day(from)}` : "with the next payment"}.` });
      router.refresh();
    } catch (e) {
      fail(e, "Could not change the plan.");
    }
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-6 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <span className="font-medium">Monthly plan</span>
          {paid ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {subscription.planName} <Badge variant="outline">{STATUS_LABEL[subscription.status] ?? subscription.status}</Badge>
              {subscription.currentPeriodEnd && <>· paid until {day(subscription.currentPeriodEnd)}</>}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No plan yet.</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.refresh()}>Check again</Button>
      </div>
      {plans.length === 0 && <p className="text-sm text-muted-foreground">No plans with a price yet. Add one in Admin › Plans and prices.</p>}
      <ul className="divide-y divide-border">
        {plans.map((plan) => {
          const current = paid && subscription.priceId === plan.priceId;
          const next = paid && subscription.nextPriceId === plan.priceId;
          return (
            <li key={plan.priceId} className="flex items-center justify-between gap-3 py-3">
              <span className="text-sm">
                <span className="font-medium">{plan.name}</span> · {formatRupees(plan.amountMinor)} + GST · {plan.credits.toLocaleString("en-IN")} credits a month
              </span>
              {current ? (
                <Badge variant="outline">Current</Badge>
              ) : next ? (
                <Badge variant="outline">From next payment</Badge>
              ) : paid ? (
                <Button size="sm" variant="outline" disabled={busy || subscription.status === "cancelling"} onClick={() => void switchTo(plan)}>Change to this</Button>
              ) : (
                <Button size="sm" disabled={busy} onClick={() => void start(plan)}>Subscribe</Button>
              )}
            </li>
          );
        })}
      </ul>
      {paid && subscription.status !== "cancelling" && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void stop()}>Cancel plan</Button>
      )}
      {status && <p className={`text-sm ${TONE_CLASS[status.tone]}`}>{status.text}</p>}
    </div>
  );
}
