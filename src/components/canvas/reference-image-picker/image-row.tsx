"use client";

import { Check, Expand, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { GridImage } from "./types";
import { KindBadge } from "@/components/market/kind-badge";

type Props = {
  image: GridImage;
  selected: boolean;
  onToggle: () => void;
  onPreview: () => void;
  size?: "sm" | "lg";
};

export function ImageRow({ image, selected, onToggle, onPreview, size = "sm" }: Props) {
  const large = size === "lg";
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
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-inset ring-black/10",
          large ? "size-24" : "size-8",
        )}
      >
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
            className={cn(
              "absolute inset-0 m-auto text-muted-foreground",
              large ? "size-10" : "size-3.5",
            )}
            strokeWidth={1.5}
          />
        )}
        {image.kind && <KindBadge kind={image.kind} className="left-0.5 top-0.5 p-0.5" />}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium text-foreground",
            large ? "break-words" : "truncate",
          )}
        >
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
