"use client";

import { useMemo } from "react";
import { MasonryPhotoAlbum } from "react-photo-album";
import "react-photo-album/masonry.css";
import { PlayIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useImageDimensions } from "@/hooks/use-image-dimensions";
import type { ClientBrandImageRow } from "@/lib/db/types";

type AlbumPhoto = { key: string; src: string; width: number; height: number; asset: ClientBrandImageRow };

/** A video with no known size and no poster to measure — the common reel shape. */
const VIDEO_FALLBACK = { width: 9, height: 16 };

type Props = {
  assets: ClientBrandImageRow[];
  onOpen: (index: number) => void;
  onRemove: (asset: ClientBrandImageRow) => void;
};

/**
 * The brand assets as a masonry (react-photo-album, as the canvas gallery). Each tile keeps its
 * true aspect ratio from the size recorded at import, so the layout never reflows as images
 * load; rows imported before sizes were recorded are measured in the browser instead.
 */
export function BrandAssetsMasonry({ assets, onOpen, onRemove }: Props) {
  // Only what the import could not size — normally nothing.
  const unmeasured = useMemo(
    () => assets.filter((a) => !(a.width && a.height)).flatMap((a) => (stillOf(a) ? [stillOf(a)!] : [])),
    [assets],
  );
  const measured = useImageDimensions(unmeasured);

  const photos: AlbumPhoto[] = useMemo(
    () =>
      assets.map((asset) => {
        const still = stillOf(asset);
        const size =
          asset.width && asset.height
            ? { width: asset.width, height: asset.height }
            : (still && measured.get(still)) || (asset.media_type === "video" ? VIDEO_FALLBACK : { width: 1, height: 1 });
        return { key: asset.id, src: still ?? asset.storage_url, ...size, asset };
      }),
    [assets, measured],
  );

  return (
    <MasonryPhotoAlbum
      photos={photos}
      columns={(width) => (width < 560 ? 2 : width < 900 ? 3 : width < 1200 ? 4 : 5)}
      spacing={12}
      onClick={({ index }) => onOpen(index)}
      render={{
        photo: ({ onClick }, { photo, width, height }) => (
          <Tile
            key={photo.key}
            photo={photo as AlbumPhoto}
            width={width}
            height={height}
            onOpen={onClick}
            onRemove={() => onRemove((photo as AlbumPhoto).asset)}
          />
        ),
      }}
    />
  );
}

/** What a tile shows: the small preview made at import, else the image itself (an SVG or GIF,
 *  or an older import). A video with neither shows its first frame. */
function stillOf(asset: ClientBrandImageRow): string | null {
  return asset.thumbnail_url ?? (asset.media_type === "video" ? null : asset.storage_url);
}

function Tile(props: {
  photo: AlbumPhoto;
  width: number;
  height: number;
  onOpen?: React.MouseEventHandler;
  onRemove: () => void;
}) {
  const { asset } = props.photo;
  const still = stillOf(asset);
  const isVideo = asset.media_type === "video";
  return (
    <div
      className="group relative overflow-hidden rounded-lg border border-border bg-muted transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]"
      style={{ width: props.width, height: props.height }}
    >
      <Button
        variant="ghost"
        onClick={props.onOpen}
        aria-label={`Open ${asset.filename}`}
        className="block size-full rounded-none p-0 hover:bg-transparent dark:hover:bg-transparent"
      >
        {still ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={still}
            alt={asset.filename}
            width={props.width}
            height={props.height}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <video src={asset.storage_url} preload="metadata" muted playsInline className="size-full object-cover" />
        )}
      </Button>
      {isVideo && (
        <span className="pointer-events-none absolute bottom-2 left-2 flex size-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
          <PlayIcon className="size-3.5" strokeWidth={1.5} />
        </span>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        title="Remove"
        aria-label={`Remove ${asset.filename}`}
        onClick={props.onRemove}
        className="absolute right-1.5 top-1.5 rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-black/70 hover:text-white dark:hover:bg-black/70"
      >
        <XIcon strokeWidth={1.5} />
      </Button>
    </div>
  );
}
