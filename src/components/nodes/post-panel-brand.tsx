"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

/** The kit's sections, in nav order. `colours` and `details` are not asset categories, so
 *  the union is wider than BrandAssetCategory. */
type BrandSection = BrandAssetCategory | "colours" | "details";

/**
 * Details is hidden for now.
 *
 * Phone, address and social handles exist to fill contact components, and those are deferred
 * (`2026-08-06-post-components-design.md`). Until they ship, the section is a form that saves
 * data nothing reads — which invites someone to fill it in and wonder why nothing happened.
 *
 * Deliberately still built and reachable: the column, the API, the hook and
 * `PostBrandDetails` all remain, so restoring it is putting this one line back:
 *   { key: "details", label: "Details" },
 */
/**
 * Colours is deferred, for a different reason than Details.
 *
 * The swatches derive from the KB's `colour_palette_primary`/`_secondary`, which are
 * model-extracted prose ("turmeric gold #C8A000"). Most clients have no hex in there at all,
 * so the section is empty for them, and where it is not, the values are the model's guess. A
 * palette worth clicking needs colours somebody entered deliberately, which the KB does not
 * store today.
 *
 * `extractHexes`, its tests and the API's `colours` field all stay. Restoring the section is
 * putting this line back:
 *   { key: "colours", label: "Colours" },
 */
const SECTIONS: { key: BrandSection; label: string }[] = [
  { key: "logo", label: "Logos" },
  { key: "background", label: "Backgrounds" },
  { key: "product", label: "Products" },
];

export function PostPanelBrand({
  clientId, aspectRatio, hasSelection, onPlace, onApplyColour,
}: Props) {
  const { assets, details, colours, loading, error, reload, upload, remove, patchDetail } =
    useBrandKit(clientId);
  const [uploading, setUploading] = useState<BrandAssetCategory | null>(null);
  // Logos first: it is the thing most posts need, and it is the section most likely to
  // already have something in it (the client's own logo is synthesized into it).
  const [section, setSection] = useState<BrandSection>("logo");

  async function handleUpload(category: BrandAssetCategory, file: File) {
    setUploading(category);
    await upload(category, file);
    setUploading(null);
  }

  if (loading) {
    // Shaped like the panel it becomes — a chip row, then a grid of tiles — so nothing shifts
    // when the data lands. A centred "Loading…" said nothing about what was coming and then
    // shoved the real content in from a different position.
    return (
      <div>
        <div className="mb-3 flex flex-wrap gap-1 border-b border-border pb-2">
          {[44, 72, 56].map((w) => (
            <Skeleton key={w} className="h-[22px] rounded-full" style={{ width: w }} />
          ))}
        </div>
        <Skeleton className="mb-1 h-2.5 w-36" />
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="aspect-square w-full rounded-sm" />
              <Skeleton className="h-2 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
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

  const activeCategory = BRAND_ASSET_CATEGORIES.find((c) => c.category === section);

  return (
    // Sections run ACROSS the top, not down the side. The flyout is 256px wide; a 96px
    // vertical nav plus its gap and rule left about 115px for content, which at three columns
    // made every thumbnail ~35px — too small to tell one logo from another, which is the only
    // thing a picker has to do. Wrapping chips cost two rows of height once and give the grid
    // the full width back.
    <div>
      <nav className="mb-3 flex flex-wrap gap-1 border-b border-border pb-2">
        {SECTIONS.map(({ key, label }) => (
          <Button
            key={key}
            variant="ghost"
            aria-pressed={section === key}
            onClick={() => setSection(key)}
            className={cn(
              "h-auto rounded-full px-2 py-1 text-[0.65rem] font-medium",
              section === key
                ? "bg-primary/10 text-primary hover:bg-primary/10"
                : "text-muted-foreground",
            )}
          >
            {label}
          </Button>
        ))}
      </nav>

      {/* No section heading here: the active chip above already names it, and printing it
          twice is the duplicate-title problem this panel had at the top of the editor. */}
      <div className="min-w-0">

        {section === "colours" && (
          colours.length === 0 ? (
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
                    className="size-6 rounded-full border p-0"
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
          )
        )}

        {activeCategory && (
          <PostBrandAssetGrid
            category={activeCategory.category}
            hint={activeCategory.hint}
            columns={activeCategory.columns}
            assets={assets}
            aspectRatio={
              activeCategory.category === "background" ? aspectRatio : undefined
            }
            uploading={uploading === activeCategory.category}
            onPlace={onPlace}
            onUpload={(file) => void handleUpload(activeCategory.category, file)}
            onRemove={(assetId) => void remove(assetId)}
          />
        )}

        {section === "details" && (
          <PostBrandDetails
            details={details}
            onPatch={(key: keyof BrandDetails, value: string) => void patchDetail(key, value)}
          />
        )}
      </div>
    </div>
  );
}
