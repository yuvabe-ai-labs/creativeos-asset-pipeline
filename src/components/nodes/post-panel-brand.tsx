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
const SECTIONS: { key: BrandSection; label: string }[] = [
  { key: "logo", label: "Logos" },
  { key: "colours", label: "Colours" },
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
