"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useBrandKit } from "@/hooks/use-brand-kit";
import { BRAND_ASSET_CATEGORIES } from "@/lib/brand-kit/constants";
import type { BrandAsset, BrandAssetCategory, BrandDetails } from "@/lib/brand-kit/types";
import { PostBrandAssetGrid } from "./post-brand-asset-grid";
import { PostBrandDetails } from "./post-brand-details";

type Props = {
  clientId: string;
  /** The post's aspect ratio, so background thumbnails preview at the real shape. */
  aspectRatio: string;
  /** True when exactly one layer is selected — the colour swatches act on it. */
  hasSelection: boolean;
  onPlace: (asset: BrandAsset) => void;
  onApplyColour: (hex: string) => void;
};

export function PostPanelBrand({
  clientId, aspectRatio, hasSelection, onPlace, onApplyColour,
}: Props) {
  const { assets, details, colours, loading, error, reload, upload, remove, patchDetail } =
    useBrandKit(clientId);
  const [uploading, setUploading] = useState<BrandAssetCategory | null>(null);

  async function handleUpload(category: BrandAssetCategory, file: File) {
    setUploading(category);
    await upload(category, file);
    setUploading(null);
  }

  if (loading) {
    return <p className="px-1 py-8 text-center text-xs text-muted-foreground">Loading…</p>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 px-1 py-8 text-center">
        <p className="text-xs text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void reload()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-eyebrow mb-1 !text-[0.6rem]">Colours</p>
        {colours.length === 0 ? (
          <p className="text-[0.6rem] text-muted-foreground">
            No brand colours on file yet — they come from this client&apos;s brand profile.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1">
              {colours.map((hex) => (
                <Button
                  key={hex}
                  variant="outline"
                  size="icon"
                  disabled={!hasSelection}
                  aria-label={`Apply ${hex}`}
                  title={hex}
                  onClick={() => onApplyColour(hex)}
                  className={cn("size-6 rounded-full border p-0")}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
            {/* Disabled rather than hidden: a section that disappears reads as a bug. */}
            {!hasSelection && (
              <p className="mt-1 text-[0.6rem] text-muted-foreground">
                Select a layer to recolour it.
              </p>
            )}
          </>
        )}
      </div>

      {BRAND_ASSET_CATEGORIES.map(({ category, label, hint, columns }) => (
        <PostBrandAssetGrid
          key={category}
          category={category}
          label={label}
          hint={hint}
          columns={columns}
          assets={assets}
          aspectRatio={category === "background" ? aspectRatio : undefined}
          uploading={uploading === category}
          onPlace={onPlace}
          onUpload={(file) => void handleUpload(category, file)}
          onRemove={(assetId) => void remove(assetId)}
        />
      ))}

      <PostBrandDetails
        details={details}
        onPatch={(key: keyof BrandDetails, value: string) => void patchDetail(key, value)}
      />
    </div>
  );
}
