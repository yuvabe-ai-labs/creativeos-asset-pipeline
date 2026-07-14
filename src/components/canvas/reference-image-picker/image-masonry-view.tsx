"use client";

import { useMemo } from "react";
import { MasonryPhotoAlbum } from "react-photo-album";
import "react-photo-album/masonry.css";
import { useImageDimensions } from "@/hooks/use-image-dimensions";
import { ImageTile } from "./image-tile";
import type { GridImage } from "./types";

type AlbumPhoto = {
  key: string;
  src: string;
  width: number;
  height: number;
  gridImage: GridImage;
};

type Props = {
  images: GridImage[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onPreview: (id: string) => void;
};

export function ImageMasonryView({
  images,
  selectedIds,
  onToggle,
  onPreview,
}: Props) {
  const urls = useMemo(() => images.map((img) => img.imageUrl), [images]);
  const dimensions = useImageDimensions(urls);

  const photos: AlbumPhoto[] = useMemo(
    () =>
      images.map((img) => {
        const dim = dimensions.get(img.imageUrl) ?? { width: 400, height: 400 };
        return {
          key: img.id,
          src: img.imageUrl,
          width: dim.width,
          height: dim.height,
          gridImage: img,
        };
      }),
    [images, dimensions],
  );

  return (
    <MasonryPhotoAlbum
      photos={photos}
      columns={(width) => (width < 640 ? 3 : width < 1024 ? 5 : 6)}
      spacing={8}
      render={{
        photo: ({ onClick }, { photo, width, height }) => {
          const p = photo as AlbumPhoto;
          return (
            <ImageTile
              image={p.gridImage}
              selected={selectedIds.has(p.gridImage.id)}
              width={width}
              height={height}
              onClick={(e) => onClick?.(e as React.MouseEvent)}
              onPreview={() => onPreview(p.gridImage.id)}
            />
          );
        },
      }}
      onClick={({ photo }) => onToggle((photo as AlbumPhoto).gridImage.id)}
    />
  );
}
