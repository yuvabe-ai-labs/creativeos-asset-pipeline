"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_LOCATIONS, MAX_PRODUCTS, type ScriptDoc } from "@/lib/scripts/schema";
import { useScriptAssets } from "./script-assets-context";
import { ScriptLocationCard } from "./script-location-card";
import { ScriptProductCard } from "./script-product-card";

/** D446 — the script's own products and locations, beside its cast. Read-only without the assets
 *  context; left out entirely when there are none and nothing can be added. */
export function ScriptAssetsSection({ doc }: { doc: Pick<ScriptDoc, "products" | "locations"> }) {
  const assets = useScriptAssets();
  if (!assets && doc.products.length === 0 && doc.locations.length === 0) return null;

  const add = "w-fit border border-dashed border-primary/40 text-primary hover:bg-primary/5";
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section aria-label="Products" className="flex flex-col gap-3">
        <h2 className="text-eyebrow">Products</h2>
        {doc.products.length === 0 && <p className="text-sm text-muted-foreground">No products in this script.</p>}
        <ul className="flex flex-col gap-3">
          {doc.products.map((p) => <ScriptProductCard key={p.id} product={p} />)}
        </ul>
        {assets && doc.products.length < MAX_PRODUCTS && (
          <Button variant="ghost" size="sm" className={add} onClick={() => assets.op({ op: "add_product", name: "New product" })}>
            <Plus className="size-4" strokeWidth={1.5} />
            Add a product
          </Button>
        )}
      </section>
      <section aria-label="Locations" className="flex flex-col gap-3">
        <h2 className="text-eyebrow">Locations</h2>
        {doc.locations.length === 0 && <p className="text-sm text-muted-foreground">No locations in this script.</p>}
        <ul className="flex flex-col gap-3">
          {doc.locations.map((l) => <ScriptLocationCard key={l.id} location={l} />)}
        </ul>
        {assets && doc.locations.length < MAX_LOCATIONS && (
          <Button variant="ghost" size="sm" className={add} onClick={() => assets.op({ op: "add_location", name: "New location", description: "" })}>
            <Plus className="size-4" strokeWidth={1.5} />
            Add a location
          </Button>
        )}
      </section>
    </div>
  );
}
