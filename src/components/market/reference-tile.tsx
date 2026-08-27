"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  onToggle: () => void;
  onOpen: () => void;
};

/** One market reference in the masonry. The outer element is layout only — the two
 *  affordances are real primitives side by side (never nested): a Button covering the
 *  media opens/plays it, a Checkbox in the corner toggles selection. Heights are
 *  intrinsic (h-auto) so the CSS-columns masonry can stagger them. */
export function ReferenceTile({ item, selected, selectable, onToggle, onOpen }: Props) {
  const visual =
    item.thumbnail_url ?? (item.kind === "image" || item.kind === "gif" ? item.image_url : null);

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg bg-muted",
        "ring-1 ring-inset transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:-translate-y-0.5",
        selected ? "ring-2 ring-primary" : "ring-black/10 hover:ring-black/25",
      )}
    >
      <Button
        variant="ghost"
        onClick={onOpen}
        aria-label={item.note ? `Open reference: ${item.note}` : "Open reference"}
        className="block h-auto w-full cursor-pointer p-0 hover:bg-transparent"
      >
        {visual ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={visual} alt={item.note ?? ""} className="w-full" loading="lazy" />
        ) : (
          <span className="flex min-h-28 w-full flex-col items-start justify-between gap-2 p-3 text-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://www.google.com/s2/favicons?domain=${hostOf(item.image_url)}&sz=64`}
              alt=""
              className="size-6 rounded"
            />
            <span className="block min-w-0 max-w-full">
              <span className="block truncate text-xs font-medium text-foreground">
                {hostOf(item.image_url)}
              </span>
              {item.note && (
                <span className="mt-0.5 line-clamp-2 block whitespace-normal text-xs text-muted-foreground">
                  {item.note}
                </span>
              )}
            </span>
          </span>
        )}
      </Button>

      <KindBadge kind={item.kind} />

      {visual && item.note && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <p className="line-clamp-1 text-xs text-white">{item.note}</p>
        </div>
      )}

      {selectable && (
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label="Select reference"
          className={cn(
            "absolute right-2 top-2 bg-background/90 transition-opacity duration-200",
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        />
      )}
    </div>
  );
}
