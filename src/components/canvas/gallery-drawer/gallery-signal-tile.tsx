"use client";

import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SignalWithItems } from "@/lib/db/signals";

const MAX_THUMBS = 4;

/** One signal as a drill-in row: name + tags, a short strip of its reference
 *  thumbnails, and a chevron. Browse-only — items become draggable inside. */
export function GallerySignalTile({
  signal,
  onClick,
}: {
  signal: SignalWithItems;
  onClick: () => void;
}) {
  const shown = signal.items.slice(0, MAX_THUMBS);
  const overflow = signal.items.length - shown.length;

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className="h-auto w-full justify-start gap-3 border-border bg-card px-3 py-2.5 text-left hover:bg-neutral-50"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{signal.name}</span>
        {signal.tags.length > 0 && (
          <span className="truncate text-xs text-muted-foreground">
            {signal.tags.join(" · ")}
          </span>
        )}
      </div>

      {shown.length > 0 && (
        <div className="flex shrink-0 items-center gap-1">
          {shown.map((it) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={it.id}
              src={it.thumbnail_url ?? it.image_url}
              alt=""
              className="size-7 rounded-md border border-border object-cover"
            />
          ))}
          {overflow > 0 && (
            <span className="text-xs text-muted-foreground">+{overflow}</span>
          )}
        </div>
      )}

      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
    </Button>
  );
}
