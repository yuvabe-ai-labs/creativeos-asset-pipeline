"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useChangePlan } from "@/hooks/queries/billing";
import { useBillingCheckout } from "@/hooks/use-billing-checkout";
import type { OfferPrice } from "@/lib/db/billing-owner";
import type { LiveSubscription } from "@/lib/db/billing-subscriptions";
import { ApiError } from "@/services/read-json";
import { PlanCardFace } from "@/components/billing/plan-card-face";
import { CheckoutStatusLine } from "./checkout-status-line";
import { ConfirmStepDialog } from "./confirm-step-dialog";
import { cn } from "@/lib/utils";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null);

// The owner's plans page (D582): the same cards Admin sees, each with one clear step. No plan:
// Pick this plan (pays now). On a plan: Current, or Change to this from the next payment.
export function PlansGrid({ plans, subscription }: { plans: OfferPrice[]; subscription: LiveSubscription | null }) {
  const router = useRouter();
  const { buyPlan, busy, status } = useBillingCheckout();
  const change = useChangePlan();
  const paid = subscription && subscription.status !== "created" ? subscription : null;

  if (plans.length === 0) return <p className="text-sm text-muted-foreground">No plans to pick yet. Yuvabe will add them soon.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {plans.map((p) => {
          const current = paid?.priceId === p.priceId;
          const next = paid?.nextPriceId === p.priceId;
          return (
            <Card key={p.priceId} className={cn("flex flex-col gap-0 py-0 shadow-card", current && "ring-1 ring-primary/40")}>
              <PlanCardFace
                name={p.name}
                amountMinor={p.amountMinor}
                credits={p.credits}
                monthly
                description={p.description}
                badge={current ? <Badge variant="outline">Your plan</Badge> : next ? <Badge variant="outline">From next payment</Badge> : undefined}
              />
              <div className="border-t border-border px-5 py-3">
                {current || next ? (
                  <Button className="w-full" variant="outline" disabled>{current ? "Current plan" : "Starts with your next payment"}</Button>
                ) : paid ? (
                  <ConfirmStepDialog
                    trigger={<Button className="w-full" variant="outline" disabled={busy || paid.status === "cancelling"}>Change to {p.name}</Button>}
                    title={`Change to ${p.name}?`}
                    description={`${p.name} starts with your next payment${paid.currentPeriodEnd ? ` on ${day(paid.currentPeriodEnd)}` : ""}. Until then you keep your current plan and its credits.`}
                    confirmLabel={`Change to ${p.name}`}
                    onConfirm={async () => {
                      try {
                        await change.mutateAsync(p.priceId);
                        router.refresh();
                        return null;
                      } catch (e) {
                        return e instanceof ApiError ? e.message : "Could not change the plan.";
                      }
                    }}
                  />
                ) : (
                  <Button className="w-full" disabled={busy} onClick={() => void buyPlan(p.priceId, p.name)}>Pick {p.name}</Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <CheckoutStatusLine status={status} />
      <p className="text-xs text-muted-foreground">Prices are before 18% GST. Plans renew every month until you cancel. Cancel any time; your plan works until the paid month ends.</p>
    </div>
  );
}
