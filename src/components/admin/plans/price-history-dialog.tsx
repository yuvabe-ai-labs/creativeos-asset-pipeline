"use client";

import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { BillingSettings, CatalogProduct, PriceHealth } from "@/lib/billing/catalog";
import { formatRupees, realMarginPct } from "@/lib/billing/pricing";
import { formatIstDate } from "@/lib/admin/ist";
import { cn } from "@/lib/utils";

const plain = (n: number) => n.toLocaleString("en-IN");
const agencies = (n: number) => (n === 1 ? "1 agency on it" : `${plain(n)} agencies on it`);

// Every price an offer has had, newest first, with who is still on each (D592). A changed price is
// a new one; agencies on an older price move to the newest at their next renewal, unless their plan
// can't be changed (D593).
export function PriceHistoryDialog({ product, health, settings }: { product: CatalogProduct; health: Record<string, PriceHealth>; settings: BillingSettings | null }) {
  const plan = product.kind === "plan";
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm">
            <History aria-hidden strokeWidth={1.5} />
            {product.prices.length} prices
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{product.name} prices</DialogTitle>
          <DialogDescription>
            {plan
              ? "A changed price is a new one. Agencies on an older price move to the newest at their next renewal. A plan paid by UPI or bank mandate can't be changed, so it keeps its price until it changes plan."
              : "A changed price is a new one. Agencies pay it from their next top-up."}
          </DialogDescription>
        </DialogHeader>
        <ol className="flex flex-col">
          {product.prices.map((p, i) => {
            const newer = product.prices[i - 1];
            const current = p.active && i === product.prices.findIndex((x) => x.active);
            const on = health[p.id]?.agencies ?? 0;
            const from = formatIstDate(new Date(p.created_at));
            return (
              <li key={p.id} className="grid grid-cols-[0.875rem_minmax(0,1fr)_auto] items-start gap-2.5 border-b border-border/60 py-2 text-sm last:border-b-0">
                <span aria-hidden className={cn("mt-1.5 size-2.5 rounded-full border-2", current ? "border-primary bg-primary" : "border-border bg-border")} />
                <span>
                  <span className="font-medium tabular-nums">{formatRupees(p.amount_minor)}</span>{" "}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {plain(p.credits)} credits
                    {settings ? ` · ${realMarginPct(p, settings.inrPerUsd)}% at ₹${plain(settings.inrPerUsd)}` : ""}
                  </span>
                  {plan && <span className="block text-xs text-muted-foreground">{on ? agencies(on) : "No agency on it"}</span>}
                </span>
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {current || !newer ? `From ${from}` : `${from} to ${formatIstDate(new Date(newer.created_at))}`}
                </span>
              </li>
            );
          })}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
