"use client";

import { EyeOff, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { BillingSettings, PriceHealth } from "@/lib/billing/catalog";
import type { OfferView } from "@/lib/admin/plans-page";
import { PlanCardFace } from "@/components/billing/plan-card-face";
import { cn } from "@/lib/utils";
import { HideOfferButton } from "./hide-offer-button";
import { OfferDialog } from "./offer-dialog";
import { OfferFacts } from "./offer-facts";
import { PriceHistoryDialog } from "./price-history-dialog";

// A plan or pack as owners see it (the shared face, D579), with what only Admin sees below the line:
// its health (D592), then Edit, Hide and the price history.
export function OfferCard({ view, health, settings }: { view: OfferView; health: Record<string, PriceHealth>; settings: BillingSettings | null }) {
  const { product, price } = view;
  return (
    <Card
      id={`offer-${product.id}`}
      className={cn(
        "flex scroll-mt-24 flex-col gap-0 py-0 shadow-card transition-transform duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
        !product.active && "bg-muted/40 shadow-none",
      )}
    >
      <PlanCardFace
        name={product.name}
        amountMinor={price?.amount_minor ?? null}
        credits={price?.credits ?? null}
        monthly={view.plan}
        description={product.description}
        badge={
          !product.active ? (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <EyeOff aria-hidden strokeWidth={1.5} className="size-3" />
              Hidden
            </Badge>
          ) : undefined
        }
      />
      <OfferFacts view={view} />
      <div className="flex flex-wrap gap-1 border-t border-border/60 px-2.5 py-1.5">
        <OfferDialog
          kind={product.kind}
          product={product}
          price={price}
          agencies={view.agencies - view.ending}
          settings={settings}
          trigger={
            <Button variant="ghost" size="sm">
              <Pencil aria-hidden strokeWidth={1.5} />
              Edit
            </Button>
          }
        />
        <HideOfferButton product={product} agencies={view.agencies} />
        {product.prices.length > 1 && <PriceHistoryDialog product={product} health={health} settings={settings} />}
      </div>
    </Card>
  );
}
