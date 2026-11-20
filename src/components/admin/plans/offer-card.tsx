"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { setOfferShownAction } from "@/lib/actions/billing-catalog";
import type { BillingSettings, CatalogPrice, CatalogProduct } from "@/lib/billing/catalog";
import { GST_PCT, formatRupees, realMarginPct } from "@/lib/billing/pricing";
import { cn } from "@/lib/utils";
import { OfferDialog } from "./offer-dialog";

const n = (v: number) => v.toLocaleString("en-IN");

/** The price owners can buy now: the newest shown one. */
export function currentPrice(product: CatalogProduct): CatalogPrice | null {
  return product.prices.find((p) => p.active) ?? null;
}

// A plan or pack as owners will see it (top), with what only Admin sees below the line: margin,
// agencies on it, Edit and Hide.
export function OfferCard({ product, counts, settings }: { product: CatalogProduct; counts: Record<string, number>; settings: BillingSettings | null }) {
  const [busy, setBusy] = useState(false);
  const price = currentPrice(product);
  const subscribers = product.prices.reduce((sum, p) => sum + (counts[p.id] ?? 0), 0);
  const margin = price && settings ? realMarginPct(price, settings.inrPerUsd) : null;
  const low = margin !== null && settings !== null && margin < settings.minMarginPct;

  async function toggle() {
    setBusy(true);
    const result = await setOfferShownAction({ productId: product.id, kind: product.kind, name: product.name, description: product.description, shown: !product.active });
    setBusy(false);
    if (result.error) toast.error(result.error);
  }

  return (
    <Card className={cn("flex flex-col gap-0 py-0 shadow-card", !product.active && "opacity-60")}>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <span className="font-display text-lg font-semibold tracking-tight">{product.name}</span>
          {!product.active && <Badge variant="outline">Hidden</Badge>}
        </div>
        {price ? (
          <div className="flex flex-col gap-0.5">
            <span className="flex items-baseline gap-1">
              <span className="font-display text-2xl font-semibold tracking-tight">{formatRupees(price.amount_minor)}</span>
              <span className="text-sm text-muted-foreground">{price.interval_months ? "/ month" : "once"}</span>
            </span>
            <span className="text-xs text-muted-foreground">+ GST · {formatRupees(Math.round(price.amount_minor * (1 + GST_PCT / 100)))} in all</span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">No price yet, so owners can&apos;t buy it.</span>
        )}
        {price && (
          <span className="text-sm">
            {n(price.credits)} credits {price.interval_months ? "every month" : "until the plan month ends"}
          </span>
        )}
        {product.description && <span className="text-sm text-muted-foreground">{product.description}</span>}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-2.5">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {margin !== null && (
            <span className={cn("flex items-center gap-1", low && "font-medium text-destructive")}>
              {low && <TriangleAlert className="size-3.5" strokeWidth={1.5} />}
              {margin}% margin
            </span>
          )}
          {margin !== null && <span aria-hidden>·</span>}
          {subscribers === 1 ? "1 agency" : `${subscribers} agencies`}
        </span>
        <span className="flex">
          <OfferDialog kind={product.kind} product={product} price={price} subscribers={subscribers} settings={settings} trigger={<Button variant="ghost" size="sm">Edit</Button>} />
          <Button variant="ghost" size="sm" onClick={() => void toggle()} disabled={busy}>
            {product.active ? "Hide" : "Show"}
          </Button>
        </span>
      </div>
    </Card>
  );
}
