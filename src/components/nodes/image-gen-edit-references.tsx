"use client";

import { Check, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type EditReferenceItem = {
  id: string;
  label: string;
  url: string;
  isBase: boolean;
};

type Props = {
  items: EditReferenceItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
};

// Selectable connected-node tiles. Base is shown but not toggleable (it's the image being
// edited, not an extra). Selected extras are sent to the edit route (spec §7).
export function ImageGenEditReferences({ items, selectedIds, onToggle }: Props) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <span className="text-eyebrow !text-[0.6rem] text-muted-foreground">
        References for this edit
      </span>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => {
          const selected = it.isBase || selectedIds.includes(it.id);
          return (
            <button
              key={it.id}
              type="button"
              disabled={it.isBase}
              onClick={() => !it.isBase && onToggle(it.id)}
              className={cn(
                "nodrag group relative size-16 overflow-hidden rounded-lg border transition-colors",
                it.isBase
                  ? "border-border opacity-90"
                  : selected
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-dashed border-primary/40 hover:bg-primary/5",
              )}
              title={it.isBase ? "Base image (being edited)" : it.label}
            >
              {it.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.url} alt={it.label} className="size-full object-cover" />
              ) : (
                <ImageIcon className="m-auto size-5 text-muted-foreground/50" strokeWidth={1.5} />
              )}
              {it.isBase ? (
                <span className="absolute inset-x-0 bottom-0 bg-background/80 py-0.5 text-center text-[0.55rem] font-medium">
                  Base
                </span>
              ) : (
                selected && (
                  <span className="absolute right-1 top-1 inline-flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-2.5" strokeWidth={3} />
                  </span>
                )
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
