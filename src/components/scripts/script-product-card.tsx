"use client";

import { useState } from "react";
import { ImagePlus, Package, Star, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditableField } from "@/components/nodes/editable-field";
import { MAX_PRODUCT_IMAGES, type Product, type ScriptImage } from "@/lib/scripts/schema";
import { useScriptAssets } from "./script-assets-context";
import { ScriptImagePicker } from "./script-image-picker";

/** D446 — one of the script's products: its name and its pictures, the main packshot first. */
export function ScriptProductCard({ product }: { product: Product }) {
  const assets = useScriptAssets();
  const [picking, setPicking] = useState(false);
  const room = MAX_PRODUCT_IMAGES - product.images.length;
  const setImages = (images: ScriptImage[]) => assets?.op({ op: "set_product_images", productId: product.id, images });
  const uploading = assets?.uploadingTo === product.id;

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Package className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        <span className="min-w-0 flex-1 font-medium">
          {assets ? (
            <EditableField
              value={product.name}
              singleLine
              onCommit={(name) => assets.op({ op: "rename_product", productId: product.id, name })}
            />
          ) : product.name}
        </span>
        {assets && (
          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${product.name}`} onClick={() => assets.op({ op: "remove_product", productId: product.id })}>
            <Trash2 className="size-4" strokeWidth={1.5} />
          </Button>
        )}
      </div>

      {product.images.length === 0 ? (
        <span className="text-xs text-muted-foreground">Needs a picture</span>
      ) : (
        // Three to a row (3 + 3 at the six-picture max), each a square that fills its column.
        <ul className="grid grid-cols-3 gap-2" aria-label={`${product.name} pictures`}>
          {product.images.map((img, i) => (
            <li key={img.url} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={i === 0 ? `${product.name}, main picture` : `${product.name}, angle ${i}`} className="size-full object-contain" />
              {i === 0 && <Badge variant="secondary" className="absolute bottom-0.5 left-0.5 px-1 py-0 text-[0.6rem]">Main</Badge>}
              {assets && (
                <span className="absolute right-0.5 top-0.5 hidden gap-0.5 group-hover:flex group-focus-within:flex">
                  {i > 0 && (
                    <Button variant="secondary" size="icon-xs" aria-label="Make this the main picture"
                      onClick={() => setImages([img, ...product.images.filter((_, j) => j !== i)])}>
                      <Star className="size-3" strokeWidth={1.5} />
                    </Button>
                  )}
                  <Button variant="secondary" size="icon-xs" aria-label="Remove this picture"
                    className="hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
                    onClick={() => setImages(product.images.filter((_, j) => j !== i))}>
                    <X className="size-3" strokeWidth={1.5} />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {assets && room > 0 && (
        <Button
          variant="ghost"
          size="sm"
          disabled={uploading}
          onClick={() => setPicking(true)}
          className="w-fit border border-dashed border-primary/40 text-primary hover:bg-primary/5"
        >
          <ImagePlus className="size-4" strokeWidth={1.5} />
          {uploading ? "Adding…" : product.images.length === 0 ? "Add pictures" : "Add angles"}
        </Button>
      )}
      {assets && (
        <ScriptImagePicker
          clientId={assets.clientId}
          open={picking}
          onOpenChange={setPicking}
          title={`Pictures of ${product.name}`}
          max={room}
          existing={product.images.map((img) => img.url)}
          onRemoveExisting={(i) => setImages(product.images.filter((_, j) => j !== i))}
          onMakeMainExisting={(i) => setImages([product.images[i], ...product.images.filter((_, j) => j !== i)])}
          onUpload={(files) => void assets.upload(files, { kind: "product", productId: product.id })}
          onPick={(images) => setImages([...product.images, ...images])}
        />
      )}
    </li>
  );
}
