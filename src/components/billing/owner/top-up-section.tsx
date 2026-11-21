"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { OfferPrice } from "@/lib/db/billing-owner";
import { useBillingCheckout } from "@/hooks/use-billing-checkout";
import { PlanCardFace } from "@/components/billing/plan-card-face";
import { CheckoutStatusLine } from "./checkout-status-line";

// Top-up packs on Billing (D522): the same card face as everywhere, with Buy. Only on a running
// plan; otherwise says why.
export function TopUpSection({ packs, planRunning }: { packs: OfferPrice[]; planRunning: boolean }) {
  const { buyTopUp, busy, status } = useBillingCheckout();
  if (packs.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-xl font-semibold tracking-tight">Top up</h2>
        <p className="text-sm text-muted-foreground">
          {planRunning ? "Extra credits until your plan month ends. Used after your free and plan credits." : "Top-ups need an active plan."}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {packs.map((p) => (
          <Card key={p.priceId} className="flex flex-col gap-0 py-0 shadow-card">
            <PlanCardFace name={p.name} amountMinor={p.amountMinor} credits={p.credits} monthly={false} description={p.description} />
            <div className="border-t border-border px-5 py-3">
              <Button className="w-full" variant="outline" disabled={busy || !planRunning} onClick={() => void buyTopUp(p.priceId)}>Buy</Button>
            </div>
          </Card>
        ))}
      </div>
      <CheckoutStatusLine status={status} />
    </section>
  );
}
