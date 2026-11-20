"use client";

import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { BillingSettings, CatalogProduct } from "@/lib/billing/catalog";
import { ProductDialog } from "./product-dialog";
import { PriceDialog } from "./price-dialog";
import { PriceRow } from "./price-row";

const addChip = "border border-dashed border-primary/40 hover:bg-primary/5";
const COPY = {
  plan: { title: "Plans", add: "Add a plan", empty: "No plans yet. Add one, then give it a monthly price." },
  topup: { title: "Top-up packs", add: "Add a top-up pack", empty: "No top-up packs yet." },
} as const;

// Plans or top-up packs, each with its prices (spec §2 and §3).
export function CatalogSection({
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
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold tracking-tight">{copy.title}</h2>
        <ProductDialog kind={kind} trigger={<Button variant="ghost" size="sm" className={addChip}><Plus className="size-4" strokeWidth={1.5} />{copy.add}</Button>} />
      </div>
      {products.length === 0 && <p className="text-sm text-muted-foreground">{copy.empty}</p>}
      {products.map((product) => (
        <Card key={product.id} className="flex flex-col gap-2 p-6 shadow-card">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2 font-medium">
                {product.name}
                {!product.active && <Badge variant="outline">Hidden</Badge>}
              </span>
              {product.description && <span className="text-sm text-muted-foreground">{product.description}</span>}
            </div>
            <div className="flex gap-1">
              <ProductDialog kind={kind} product={product} trigger={<Button variant="ghost" size="sm">Edit</Button>} />
              <PriceDialog product={product} settings={settings} trigger={<Button variant="ghost" size="sm" className={addChip}><Plus className="size-4" strokeWidth={1.5} />Add a price</Button>} />
            </div>
          </div>
          {product.prices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No price yet, so owners can&apos;t buy it.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {product.prices.map((price) => (
                <PriceRow key={price.id} product={product} price={price} subscribers={counts[price.id] ?? 0} settings={settings} />
              ))}
            </ul>
          )}
        </Card>
      ))}
    </section>
  );
}
