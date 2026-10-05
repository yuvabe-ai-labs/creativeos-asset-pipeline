"use client";

import { useMemo } from "react";
import { ExternalLinkIcon } from "lucide-react";
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

// The design system's only easing (AGENTS.md "Motion"): no springs, no bounce.
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** How close to the end of the loaded slides the next page is fetched. */
const PREFETCH_WITHIN = 3;

type Props = {
  assets: ClientBrandImageRow[];
  /** The open slide, or -1 when closed. */
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  hasMore: boolean;
  onNeedMore: () => void;
};

/** The brand assets carousel (D302): images zoomable, videos playable, a filmstrip below, and
 *  the grid's next page fetched as you near the end — so arrowing through never hits a wall. */
export function BrandAssetsLightbox({ assets, index, onIndexChange, onClose, hasMore, onNeedMore }: Props) {
  const slides = useMemo(() => assets.map(toSlide), [assets]);

  return (
    <Lightbox
      open={index >= 0}
      index={Math.max(index, 0)}
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
      carousel={{ finite: true, preload: 2, padding: "24px" }}
      animation={{ fade: 320, swipe: 500, easing: { fade: EASE, swipe: EASE, navigation: EASE } }}
      controller={{ closeOnBackdropClick: true }}
      captions={{ descriptionTextAlign: "start", descriptionMaxLines: 2 }}
      thumbnails={{ width: 72, height: 72, border: 0, borderRadius: 6, padding: 0, gap: 8, imageFit: "cover" }}
      video={{ autoPlay: true, controls: true, playsInline: true, preload: "metadata" }}
      zoom={{ maxZoomPixelRatio: 2, scrollToZoom: true }}
      styles={{
        container: { backgroundColor: "rgba(11, 15, 25, 0.94)" },
        thumbnailsContainer: { backgroundColor: "rgba(11, 15, 25, 0.94)" },
      }}
      toolbar={{ buttons: [<OpenOriginal key="open" slide={slides[index]} />, "close"] }}
    />
  );
}

type AssetSlide = Slide & { originalUrl: string };

function toSlide(asset: ClientBrandImageRow): AssetSlide {
  const title = IMPORT_SOURCE_LABELS[asset.source as ImportSource] ?? "Upload";
  const posted = asset.posted_at
    ? new Date(asset.posted_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : null;
  const caption = {
    title,
    description: (
      <span className="text-sm text-white/70">
        {posted ? `Posted ${posted}` : "From the website"}
        {asset.source_url && (
          <>
            {" · "}
            <a href={asset.source_url} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-white">
              View source
            </a>
          </>
        )}
      </span>
    ),
  };
  const size = asset.width && asset.height ? { width: asset.width, height: asset.height } : {};

  if (asset.media_type === "video") {
    return {
      type: "video",
      ...caption,
      ...size,
      poster: asset.thumbnail_url ?? undefined,
      sources: [{ src: asset.storage_url, type: `video/${asset.file_ext === "webm" ? "webm" : "mp4"}` }],
      originalUrl: asset.storage_url,
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
  return { src: asset.storage_url, alt: asset.filename, ...caption, ...size, srcSet, originalUrl: asset.storage_url };
}

/** Opens the stored file in a new tab — the lightbox's own button styling, as a link. */
function OpenOriginal({ slide }: { slide?: Slide }) {
  const url = (slide as AssetSlide | undefined)?.originalUrl;
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="yarl__button" title="Open original" aria-label="Open original">
      <ExternalLinkIcon className="size-5" strokeWidth={1.5} />
    </a>
  );
}
