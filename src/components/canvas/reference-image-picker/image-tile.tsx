"use client";

import { Check, Expand } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { GridImage } from "./types";
import { KindBadge } from "@/components/market/kind-badge";

type Props = {
  image: GridImage;
  selected: boolean;
  width: number;
  height: number;
  onClick: (e: React.MouseEvent | React.KeyboardEvent) => void;
  onPreview: () => void;
};

export function ImageTile({
  image,
  selected,
  width,
  height,
  onClick,
  onPreview,
}: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(e);
        }
      }}
      title={image.filename}
      style={{ width, height }}
      className={cn(
        "group relative block cursor-pointer overflow-hidden rounded-md bg-muted",
        "ring-1 ring-inset transition-[box-shadow,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:scale-[1.01]",
        selected
          ? "ring-[3px] ring-primary"
          : "ring-black/10 hover:ring-black/30",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.imageUrl}
        alt={image.filename}
        className="absolute inset-0 block h-full w-full object-cover"
        loading="lazy"
      />
      <div
        className={cn(
          "absolute inset-0 bg-black/25 transition-opacity duration-150",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      />
      {image.kind && <KindBadge kind={image.kind} />}
      <SelectionBadge selected={selected} />
      <PreviewButton
        onClick={(e) => {
          e.stopPropagation();
          onPreview();
        }}
      />
    </div>
  );
}

function PreviewButton({
  onClick,
}: {
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label="Preview image"
      className="absolute right-1.5 top-1.5 size-6 rounded-md bg-black/40 text-white opacity-0 backdrop-blur-sm transition-opacity duration-150 hover:bg-black/60 hover:text-white group-hover:opacity-100"
    >
      <Expand className="size-3.5" strokeWidth={1.5} />
    </Button>
  );
}

function SelectionBadge({ selected }: { selected: boolean }) {
  return (
    <div
      className={cn(
        "absolute left-1.5 top-1.5 flex size-4 items-center justify-center rounded-full border transition-all duration-150",
        selected
          ? "border-primary bg-primary"
          : "border-white/80 bg-black/30 opacity-0 group-hover:opacity-100",
      )}
    >
      {selected && <Check className="size-2.5 text-white" strokeWidth={3} />}
    </div>
  );
}
