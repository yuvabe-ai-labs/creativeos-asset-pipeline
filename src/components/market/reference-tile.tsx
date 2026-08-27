"use client";

import { Check, Expand } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { MoodboardItem } from "@/lib/db/moodboards";
import { KindBadge } from "./kind-badge";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type Props = {
  item: MoodboardItem;
  selected: boolean;
  selectable: boolean;
  width?: number;
  height?: number;
  onToggle: () => void;
  onOpen: () => void;
};

export function ReferenceTile({ item, selected, selectable, width, height, onToggle, onOpen }: Props) {
  const visual =
    item.thumbnail_url ?? (item.kind === "image" || item.kind === "gif" ? item.image_url : null);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={selectable ? onToggle : onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          (selectable ? onToggle : onOpen)();
        }
      }}
      title={item.note ?? item.image_url}
      style={width && height ? { width, height } : undefined}
      className={cn(
        "group relative block cursor-pointer overflow-hidden rounded-md bg-muted",
        "ring-1 ring-inset transition-[box-shadow,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:scale-[1.01]",
        selected ? "ring-[3px] ring-primary" : "ring-black/10 hover:ring-black/30",
      )}
    >
      {visual ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={visual} alt={item.note ?? ""} className="size-full object-cover" loading="lazy" />
      ) : (
        <div className="flex size-full min-h-24 flex-col items-start justify-between gap-2 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://www.google.com/s2/favicons?domain=${hostOf(item.image_url)}&sz=64`}
            alt=""
            className="size-6 rounded"
          />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">{hostOf(item.image_url)}</p>
            {item.note && <p className="line-clamp-2 text-xs text-muted-foreground">{item.note}</p>}
          </div>
        </div>
      )}

      <KindBadge kind={item.kind} />

      {visual && item.note && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <p className="line-clamp-1 text-xs text-white">{item.note}</p>
        </div>
      )}

      {selected && (
        <span className="absolute right-1.5 top-1.5 rounded-full bg-primary p-0.5 text-primary-foreground">
          <Check className="size-3.5" strokeWidth={2} />
        </span>
      )}

      {selectable && (
        <Button
          variant="secondary"
          size="icon"
          className="absolute bottom-1.5 right-1.5 size-6 opacity-0 shadow-card transition-opacity duration-200 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          aria-label="Open reference"
        >
          <Expand className="size-3.5" strokeWidth={1.5} />
        </Button>
      )}
    </div>
  );
}
