"use client";

import { useRef } from "react";
import { Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startElementDrag } from "./post-element-drag";
import { SYNTHETIC_LOGO_ID } from "@/lib/brand-kit/constants";
import type { BrandAsset, BrandAssetCategory } from "@/lib/brand-kit/types";

/** Singular and concrete — "Upload logo" beats a bare plus icon at telling you what the
 *  tile does, and matches the section you are already looking at. */
const UPLOAD_LABELS: Record<BrandAssetCategory, string> = {
  logo: "Upload logo",
  background: "Upload background",
  product: "Upload product",
};

type Props = {
  category: BrandAssetCategory;
  hint: string;
  columns: 2 | 3;
  assets: BrandAsset[];
  /** Aspect ratio for the thumbnails — backgrounds preview at the post's real shape. */
  aspectRatio?: string;
  uploading: boolean;
  onPlace: (asset: BrandAsset) => void;
  onUpload: (file: File) => void;
  onRemove: (assetId: string) => void;
};

export function PostBrandAssetGrid({
  category, hint, columns, assets, aspectRatio, uploading,
  onPlace, onUpload, onRemove,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mine = assets.filter((a) => a.category === category);

  return (
    <div>
      <p className="mb-1 text-[0.6rem] text-muted-foreground">
        Click to add, or drag onto the canvas.
      </p>
      <div className={cn("grid gap-1", columns === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {mine.map((asset) => (
          <div key={asset.id} className="group relative">
            <Button
              variant="outline"
              title={asset.name}
              aria-label={asset.name}
              onClick={() => onPlace(asset)}
              draggable
              onDragStart={(e) =>
                startElementDrag(e, {
                  kind: "brand-asset",
                  category: asset.category,
                  url: asset.storageUrl,
                })
              }
              className="h-auto w-full cursor-grab p-1 active:cursor-grabbing"
            >
              {/* Chequerboard behind logos: they are usually transparent PNGs, and on a
                  white tile a white mark looks like an empty button. */}
              <span
                className={cn(
                  "block w-full overflow-hidden rounded-sm",
                  category === "logo" &&
                    "bg-[repeating-conic-gradient(#f4f4f5_0_25%,transparent_0_50%)] bg-[length:12px_12px]",
                )}
                style={{ aspectRatio: aspectRatio ?? "1 / 1" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.storageUrl}
                  alt={asset.name}
                  className={cn(
                    "size-full",
                    category === "logo" ? "object-contain" : "object-cover",
                  )}
                />
              </span>
              <span className="block w-full truncate px-0.5 text-[0.6rem] font-medium leading-tight">
                {asset.name}
              </span>
              {/* Says why this one has no remove button. Without it, the missing control
                  reads as broken rather than deliberate. */}
              {asset.id === SYNTHETIC_LOGO_ID && (
                <span className="block w-full truncate px-0.5 text-[0.55rem] font-normal leading-tight text-muted-foreground">
                  From client profile
                </span>
              )}
            </Button>
            {/* The client's own logo is not a row — the client page owns it (D131). */}
            {asset.id !== SYNTHETIC_LOGO_ID && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${asset.name}`}
                title="Remove"
                onClick={() => onRemove(asset.id)}
                className="absolute -right-1 -top-1 size-5 rounded-full border border-border bg-card opacity-0 transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100"
              >
                <Trash2 className="size-3" strokeWidth={1.5} />
              </Button>
            )}
          </div>
        ))}

        <Button
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          title="Upload"
          aria-label={`Upload a new ${category}`}
          className="h-auto w-full flex-col gap-1 border-dashed border-primary/40 p-1 hover:bg-primary/5"
        >
          <span
            className="flex w-full items-center justify-center"
            style={{ aspectRatio: aspectRatio ?? "1 / 1" }}
          >
            <Upload className="size-4 text-primary" strokeWidth={1.5} />
          </span>
          <span className="block w-full px-0.5 text-[0.6rem] font-medium leading-tight text-primary">
            {uploading ? "Uploading…" : UPLOAD_LABELS[category]}
          </span>
        </Button>
      </div>

      {mine.length === 0 && (
        <p className="mt-1 text-[0.6rem] text-muted-foreground">{hint}</p>
      )}

      {/* The one carve-out from the shadcn-only rule: a hidden native file input is the
          only way to open the OS picker. Same pattern as post-panel-elements.tsx. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
    </div>
  );
}
