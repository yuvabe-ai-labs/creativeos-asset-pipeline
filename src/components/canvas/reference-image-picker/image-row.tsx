"use client";

import { Check, Expand, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { GridImage } from "./types";

type Props = {
  image: GridImage;
  selected: boolean;
  onToggle: () => void;
  onPreview: () => void;
};

export function ImageRow({ image, selected, onToggle, onPreview }: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        "group flex cursor-pointer items-center gap-3 rounded-lg border px-2 py-1.5 transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-transparent hover:border-border hover:bg-muted/50",
      )}
    >
      <div className="relative size-8 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-inset ring-black/10">
        {image.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.imageUrl}
            alt={image.filename}
            className="absolute inset-0 block h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <ImageIcon
            className="absolute inset-0 m-auto size-3.5 text-muted-foreground"
            strokeWidth={1.5}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {image.filename}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {image.subtitle}
        </p>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          onPreview();
        }}
        aria-label="Preview image"
        className="size-6 shrink-0 rounded-md text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
      >
        <Expand className="size-3.5" strokeWidth={1.5} />
      </Button>

      <div
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border transition-all duration-150",
          selected
            ? "border-primary bg-primary"
            : "border-border opacity-0 group-hover:opacity-100",
        )}
      >
        {selected && <Check className="size-2.5 text-white" strokeWidth={3} />}
      </div>
    </div>
  );
}
