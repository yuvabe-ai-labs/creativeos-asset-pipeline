"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useConfirmTopUp, useStartTopUp } from "@/hooks/queries/billing";
import { CHECKOUT_LOAD_FAILED, loadCheckout, openCheckout, type CheckoutSuccess } from "@/lib/billing/load-checkout";
import { formatRupees } from "@/lib/billing/pricing";
import { ApiError } from "@/services/read-json";

export type TestPack = { priceId: string; name: string; amountMinor: number; credits: number };

type Status = { tone: "info" | "ok" | "error"; text: string } | null;
const TONE_CLASS = { info: "text-muted-foreground", ok: "text-foreground", error: "text-destructive-text" } as const;

// D522, test page only: buy a top-up pack on an active plan. The credits come with the webhook and
// last until the plan month ends.
export function TestPacks({ packs, planRunning }: { packs: TestPack[]; planRunning: boolean }) {
  const router = useRouter();
  const start = useStartTopUp();
  const confirm = useConfirmTopUp();
  const [status, setStatus] = useState<Status>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const busy = start.isPending || confirm.isPending || checkoutOpen;

  async function buy(pack: TestPack) {
    setStatus(null);
    try {
      const [order] = await Promise.all([start.mutateAsync(pack.priceId), loadCheckout()]);
      setCheckoutOpen(true);
      openCheckout(
        {
          key: order.keyId,
          order_id: order.orderId,
          amount: order.amountPaise,
          currency: "INR",
          name: "CreativeOS",
          description: `${order.name} (test)`,
          handler: async (r: CheckoutSuccess) => {
            try {
              await confirm.mutateAsync({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
              setStatus({ tone: "ok", text: "Payment received. The credits are added as soon as it's confirmed." });
            } catch {
              setStatus({ tone: "error", text: "We couldn't confirm the payment here. If you were charged, the credits are still added once it's confirmed." });
            } finally {
              setCheckoutOpen(false);
              router.refresh();
            }
          },
          modal: { ondismiss: () => { setCheckoutOpen(false); setStatus((s) => s ?? { tone: "info", text: "Payment window closed. Nothing was charged." }); } },
        },
        () => setStatus({ tone: "error", text: "The payment didn't go through. No credits were added." }),
      );
    } catch (e) {
      setCheckoutOpen(false);
      const ours = e instanceof ApiError || (e instanceof Error && e.message === CHECKOUT_LOAD_FAILED);
      setStatus({ tone: "error", text: ours ? (e as Error).message : "Could not start the payment." });
    }
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-6 shadow-card">
      <div className="space-y-1">
        <span className="font-medium">Top-up packs</span>
        <p className="text-sm text-muted-foreground">
          {planRunning ? "Extra credits until your plan month ends." : "Top-ups need an active plan."}
        </p>
      </div>
      {packs.length === 0 && <p className="text-sm text-muted-foreground">No top-up packs yet. Add one in Admin › Plans and prices.</p>}
      <ul className="divide-y divide-border">
        {packs.map((pack) => (
          <li key={pack.priceId} className="flex items-center justify-between gap-3 py-3">
            <span className="text-sm">
              <span className="font-medium">{pack.name}</span> · {formatRupees(pack.amountMinor)} + GST · {pack.credits.toLocaleString("en-IN")} credits
            </span>
            <Button size="sm" variant="outline" disabled={busy || !planRunning} onClick={() => void buy(pack)}>Buy</Button>
          </li>
        ))}
      </ul>
      {status && <p className={`text-sm ${TONE_CLASS[status.tone]}`}>{status.text}</p>}
    </div>
  );
}
