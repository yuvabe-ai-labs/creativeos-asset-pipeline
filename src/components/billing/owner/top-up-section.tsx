"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { OfferPrice } from "@/lib/db/billing-owner";
import { formatRupees } from "@/lib/billing/pricing";
import { useBillingCheckout } from "@/hooks/use-billing-checkout";
import { CheckoutStatusLine } from "./checkout-status-line";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// Top-up packs in the Usage page's side column (D581, D597), each with Buy. Only while a plan is
// running: without one there is nothing to top up, so nothing shows. `id="top-up"` is where the
// running-low notice's Top up goes.
export function TopUpSection({ packs, planRunning, planEndsAt }: { packs: OfferPrice[]; planRunning: boolean; planEndsAt: string | null }) {
  const { buyTopUp, busy, status } = useBillingCheckout();
  if (packs.length === 0 || !planRunning) return null;
  return (
    <Card id="top-up" className="scroll-mt-24 gap-0 py-0 shadow-card">
      <div className="flex flex-col gap-1 p-5 pb-3">
        <h2 className="font-display text-base font-semibold tracking-tight">Top up</h2>
        <p className="text-sm text-muted-foreground">
          Extra credits until your plan month ends{planEndsAt ? ` on ${day(planEndsAt)}` : ""}. Used after your free and plan credits.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-border border-t border-border">
        {packs.map((p) => (
          <li key={p.priceId} className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium tabular-nums">{p.credits.toLocaleString("en-IN")} credits</span>
              <span className="text-xs text-muted-foreground">{formatRupees(p.amountMinor)} + GST</span>
            </span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void buyTopUp(p.priceId)}>Buy</Button>
          </li>
        ))}
      </ul>
      {status && (
        <div className="border-t border-border px-5 py-3">
          <CheckoutStatusLine status={status} />
        </div>
      )}
    </Card>
  );
}
