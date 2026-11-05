"use client";

import { MapPin, Package } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ScriptDoc, Shot } from "@/lib/scripts/schema";
import { useScriptAssets } from "./script-assets-context";

const NO_LOCATION = "__none__";

/** D446 — which of the script's products a shot shows and where it is set: two pickers when the
 *  script page can edit, one line when it can't. Nothing at all when the script has neither. */
export function ScriptShotAssets({ shot, doc }: { shot: Shot; doc: Pick<ScriptDoc, "products" | "locations"> }) {
  const assets = useScriptAssets();
  if (doc.products.length === 0 && doc.locations.length === 0) return null;

  const productNames = shot.products.map((id) => doc.products.find((p) => p.id === id)?.name).filter(Boolean);
  const locationName = doc.locations.find((l) => l.id === shot.location)?.name ?? null;

  if (!assets) {
    const parts = [
      productNames.length > 0 ? `Products: ${productNames.join(", ")}` : "",
      locationName ? `Location: ${locationName}` : "",
    ].filter(Boolean);
    return parts.length > 0 ? <span className="text-xs text-muted-foreground">{parts.join(" · ")}</span> : null;
  }

  const set = (products: string[], location: string | null) =>
    assets.op({ op: "set_shot_assets", shotId: shot.id, products, location });

  return (
    <span className="flex flex-wrap gap-1.5">
      {doc.products.length > 0 && (
        <Select
          multiple
          value={shot.products}
          onValueChange={(v) => set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [], shot.location)}
        >
          <SelectTrigger size="sm" className="w-fit max-w-full" aria-label="Products in this shot">
            <Package className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
            <SelectValue>{productNames.length > 0 ? productNames.join(", ") : "No product"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {doc.products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {doc.locations.length > 0 && (
        <Select
          value={shot.location ?? NO_LOCATION}
          onValueChange={(v) => { if (typeof v === "string") set(shot.products, v === NO_LOCATION ? null : v); }}
        >
          <SelectTrigger size="sm" className="w-fit max-w-full" aria-label="Location of this shot">
            <MapPin className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
            <SelectValue>{locationName ?? "No location"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_LOCATION}>No location</SelectItem>
            {doc.locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </span>
  );
}
