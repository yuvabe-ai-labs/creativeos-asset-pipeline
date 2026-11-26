"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BillingSettings, CatalogProduct } from "@/lib/billing/catalog";
import { OfferCard } from "./offer-card";
import { OfferDialog } from "./offer-dialog";

const COPY = {
  plan: { title: "Plans", hint: "Paid monthly. Credits arrive every month.", add: "Add a plan" },
  topup: { title: "Top-up packs", hint: "Paid once, for an agency on a plan. Credits last until the plan month ends.", add: "Add a top-up pack" },
} as const;

// Plans or packs as a grid of cards, ending with a dashed Add tile (spec "One step").
export function OffersSection({
  kind,
  products,
  counts,
  settings,
}: {
  kind: "plan" | "topup";
  products: CatalogProduct[];
  counts: Record<string, number>;
  settings: BillingSettings | null;
}) {
  const copy = COPY[kind];
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-xl font-semibold tracking-tight">{copy.title}</h2>
        <p className="text-sm text-muted-foreground">{copy.hint}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((product) => (
          <OfferCard key={product.id} product={product} counts={counts} settings={settings} />
        ))}
        <OfferDialog
          kind={kind}
          settings={settings}
          trigger={
            <Button
              variant="ghost"
              className="flex h-auto min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 text-primary hover:bg-primary/5"
            >
              <Plus className="size-5" strokeWidth={1.5} />
              {copy.add}
            </Button>
          }
        />
      </div>
    </section>
  );
}
