"use client";

import { ImageRow } from "./image-row";
import type { GridImage } from "./types";

type Props = {
  images: GridImage[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onPreview: (id: string) => void;
};

export function ImageListView({
  images,
  selectedIds,
  onToggle,
  onPreview,
}: Props) {
  return (
    <div className="flex flex-col gap-0.5">
      {images.map((image) => (
        <ImageRow
          key={image.id}
          image={image}
          selected={selectedIds.has(image.id)}
          onToggle={() => onToggle(image.id)}
          onPreview={() => onPreview(image.id)}
        />
      ))}
    </div>
  );
}
