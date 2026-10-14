"use client";

import { useMemo } from "react";
import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, Trash2Icon, XIcon } from "lucide-react";
import Lightbox, { type Slide } from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Video from "yet-another-react-lightbox/plugins/video";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import "yet-another-react-lightbox/plugins/counter.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";
import { IMPORT_PREVIEW_PX, IMPORT_SOURCE_LABELS, type ImportSource } from "@/lib/asset-import/constants";
import type { ClientBrandImageRow } from "@/lib/db/types";
import { Button } from "@/components/ui/button";

// The design system's only easing (AGENTS.md "Motion"): no springs, no bounce.
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** How close to the end of the loaded slides the next page is fetched. */
const PREFETCH_WITHIN = 3;

/** Lucide at one size and weight everywhere in the lightbox (AGENTS.md "Icons"). */
const ICON = { className: "size-5", strokeWidth: 1.5 } as const;

// An opaque backdrop — the page must not show through — and the portal at the app's dialog layer
// (z-50) rather than the library's 9999, so the delete confirmation can open above it.
const ROOT_STYLE = {
  "--yarl__color_backdrop": "rgb(11 15 25)",
  "--yarl__portal_zindex": 50,
  "--yarl__button_filter": "none",
  "--yarl__toolbar_padding": "12px",
} as const;

type Props = {
  assets: ClientBrandImageRow[];
  /** The open slide, or -1 when closed. */
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  hasMore: boolean;
  onNeedMore: () => void;
  onRequestDelete: (asset: ClientBrandImageRow) => void;
};

/** The brand assets carousel (D302): images zoom (scroll, pinch, double-click), videos play, a
 *  filmstrip runs below, and the grid's next page is fetched as you near the end. Toolbar, in
 *  order: open original, delete, close. */
export function BrandAssetsLightbox(props: Props) {
  const { assets, index, onIndexChange, onClose, hasMore, onNeedMore, onRequestDelete } = props;
  const slides = useMemo(() => assets.map(toSlide), [assets]);
  const current = index >= 0 ? assets[index] : undefined;

  return (
    <Lightbox
      open={index >= 0}
      index={Math.max(0, Math.min(index, slides.length - 1))}
      close={onClose}
      slides={slides}
      plugins={[Captions, Counter, Thumbnails, Video, Zoom]}
      on={{
        view: ({ index: i }) => {
          onIndexChange(i);
          if (hasMore && i >= slides.length - PREFETCH_WITHIN) onNeedMore();
        },
      }}
      // Paged: wrapping from the last loaded slide to the first would skip everything unloaded.
      carousel={{ finite: true, preload: 2, padding: "32px" }}
      animation={{ fade: 320, swipe: 500, easing: { fade: EASE, swipe: EASE, navigation: EASE } }}
      controller={{ closeOnBackdropClick: true }}
      captions={{ descriptionTextAlign: "center", descriptionMaxLines: 1, showToggle: false }}
      counter={{ container: { style: { top: 12, left: 16, fontSize: 13, opacity: 0.7 } } }}
      thumbnails={{ width: 64, height: 64, border: 0, borderRadius: 8, padding: 0, gap: 8, imageFit: "cover", vignette: false }}
      video={{ autoPlay: true, controls: true, playsInline: true, preload: "metadata" }}
      zoom={{ maxZoomPixelRatio: 2, scrollToZoom: true }}
      styles={{ root: ROOT_STYLE, thumbnailsContainer: { backgroundColor: "rgb(11 15 25)" } }}
      toolbar={{
        buttons: [
          current ? <OpenOriginal key="open" url={current.storage_url} /> : null,
          current ? <DeleteButton key="delete" onClick={() => onRequestDelete(current)} /> : null,
          "close",
        ],
      }}
      render={{
        // Zoom stays on scroll, pinch and double-click; its two buttons only cluttered the bar.
        buttonZoom: () => null,
        iconClose: () => <XIcon {...ICON} />,
        iconPrev: () => <ChevronLeftIcon {...ICON} className="size-7" />,
        iconNext: () => <ChevronRightIcon {...ICON} className="size-7" />,
      }}
    />
  );
}

function toSlide(asset: ClientBrandImageRow): Slide {
  // One quiet line under the slide: where it came from, when, and a way to the post.
  const source = IMPORT_SOURCE_LABELS[asset.source as ImportSource] ?? "Upload";
  const posted = asset.posted_at
    ? new Date(asset.posted_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : null;
  const description = (
    <span className="text-sm text-white/70">
      {source}
      {posted && ` · Posted ${posted}`}
      {asset.source_url && (
        <>
          {" · "}
          <a href={asset.source_url} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-white">
            {asset.source === "website" ? "View page" : "View post"}
          </a>
        </>
      )}
    </span>
  );
  const size = asset.width && asset.height ? { width: asset.width, height: asset.height } : {};

  if (asset.media_type === "video") {
    return {
      type: "video",
      description,
      ...size,
      poster: asset.thumbnail_url ?? undefined,
      sources: [{ src: asset.storage_url, type: `video/${asset.file_ext === "webm" ? "webm" : "mp4"}` }],
    };
  }

  // With the size known, offer the preview and the original as a srcSet — the filmstrip and a
  // small screen take the preview, a large screen the original.
  let srcSet: { src: string; width: number; height: number }[] | undefined;
  if (asset.width && asset.height && asset.thumbnail_url) {
    // The preview was fitted INSIDE a PREVIEW×PREVIEW box, never enlarged (run.ts makePreview).
    const scale = Math.min(IMPORT_PREVIEW_PX / asset.width, IMPORT_PREVIEW_PX / asset.height, 1);
    srcSet = [
      { src: asset.thumbnail_url, width: Math.round(asset.width * scale), height: Math.round(asset.height * scale) },
      { src: asset.storage_url, width: asset.width, height: asset.height },
    ];
  }
  return { src: asset.storage_url, alt: asset.filename, description, ...size, srcSet };
}

// The lightbox's own `yarl__button` class, so these sit in its toolbar exactly like its close.
function OpenOriginal({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="yarl__button" title="Open original" aria-label="Open original">
      <ExternalLinkIcon {...ICON} />
    </a>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      title="Delete"
      aria-label="Delete"
      onClick={onClick}
      // Reset the primitive's sizing so it matches the toolbar's other buttons exactly.
      className="yarl__button h-auto w-auto rounded-none hover:bg-transparent dark:hover:bg-transparent"
    >
      <Trash2Icon {...ICON} />
    </Button>
  );
}
