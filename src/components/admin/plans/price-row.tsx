"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setPriceActiveAction } from "@/lib/actions/billing-catalog";
import type { BillingSettings, CatalogPrice, CatalogProduct } from "@/lib/billing/catalog";
import { creditsCadenceLabel, formatRupees, intervalLabel, realMarginPct } from "@/lib/billing/pricing";
import { PriceDialog } from "./price-dialog";

const n = (v: number) => v.toLocaleString("en-IN");

// One price of a plan or pack: what it costs, what it gives, its margin and who is on it.
export function PriceRow({
  product,
  price,
  subscribers,
  settings,
}: {
  product: CatalogProduct;
  price: CatalogPrice;
  subscribers: number;
  settings: BillingSettings | null;
}) {
  const [busy, setBusy] = useState(false);
  const margin = settings ? realMarginPct(price, settings.inrPerUsd) : null;
  const low = margin !== null && settings !== null && margin < settings.minMarginPct;
  const what = price.interval_months
    ? `${n(price.credits)} credits ${creditsCadenceLabel(price.interval_months, price.credits_every_months ?? price.interval_months)}`
    : `${n(price.credits)} credits, until the plan month ends`;

  async function toggle() {
    setBusy(true);
    const result = await setPriceActiveAction(price.id, !price.active);
    setBusy(false);
    if (result.error) toast.error(result.error);
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm font-medium">
          {price.interval_months ? intervalLabel(price.interval_months) : "One payment"} · {formatRupees(price.amount_minor)}
          <span className="text-xs font-normal text-muted-foreground">+ GST</span>
          {!price.active && <Badge variant="outline">Hidden</Badge>}
        </span>
        <span className="text-xs text-muted-foreground">
          {what} · {subscribers === 1 ? "1 agency" : `${subscribers} agencies`} on it
        </span>
      </div>
      <div className="flex items-center gap-2">
        {margin !== null && (
          <span className={low ? "flex items-center gap-1 text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {low && <TriangleAlert className="size-3.5" strokeWidth={1.5} />}
            Margin {margin}%
          </span>
        )}
        {price.active && (
          <PriceDialog product={product} replaces={price} subscribers={subscribers} settings={settings} trigger={<Button variant="ghost" size="sm">New price</Button>} />
        )}
        <Button variant="ghost" size="sm" onClick={() => void toggle()} disabled={busy}>
          {price.active ? "Hide" : "Show"}
        </Button>
      </div>
    </li>
  );
}
