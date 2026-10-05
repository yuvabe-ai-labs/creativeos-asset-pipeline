"use client";

import { PlayIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ClientBrandImageRow } from "@/lib/db/types";

type Props = {
  asset: ClientBrandImageRow;
  onRemove: () => void;
  /** `sm` — a fixed 80px thumbnail (the source drawer); `fill` — fills its grid cell. */
  size?: "sm" | "fill";
};

/** One imported image or video (D302). Opens the stored file in a new tab; × removes it. */
export function ImportedAssetTile({ asset, onRemove, size = "sm" }: Props) {
  const isVideo = asset.media_type === "video";
  // The small WebP preview made at import (D302) — never the original in a grid. An SVG/GIF has no
  // preview and is shown as itself; a video without one falls back to its first frame.
  const still = asset.thumbnail_url ?? (isVideo ? null : asset.storage_url);
  const posted = asset.posted_at ? new Date(asset.posted_at).toLocaleDateString() : null;
  return (
    <div
      className={cn(
        "group relative shrink-0 overflow-hidden rounded-md border border-border bg-muted",
        size === "sm" ? "size-20" : "aspect-square w-full",
      )}
    >
      <a
        href={asset.storage_url}
        target="_blank"
        rel="noreferrer"
        title={posted ? `${asset.filename} · posted ${posted}` : asset.filename}
        className="block size-full"
      >
        {still ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={still}
            alt={asset.filename}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]"
          />
        ) : (
          <video src={asset.storage_url} preload="metadata" muted className="size-full object-cover" />
        )}
        {isVideo && (
          <span className="absolute bottom-1.5 left-1.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white">
            <PlayIcon className="size-3" strokeWidth={1.5} />
          </span>
        )}
      </a>
      <Button
        type="button"
        variant="ghost"
        title="Remove"
        onClick={onRemove}
        className="absolute right-1 top-1 size-6 rounded-full bg-black/60 p-0 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/60 hover:text-white dark:hover:bg-black/60"
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
}
