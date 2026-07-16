"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  selectedCount: number;
  maxSelection: number;
  onAdd: () => void;
  onCancel: () => void;
};

export function GalleryFooter({
  selectedCount,
  maxSelection,
  onAdd,
  onCancel,
}: Props) {
  const atLimit = selectedCount >= maxSelection;
  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-t border-border bg-card px-5">
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
          selectedCount === 0
            ? "text-muted-foreground"
            : atLimit
              ? "bg-amber-100 text-amber-800"
              : "bg-primary/10 text-primary",
        )}
      >
        {selectedCount} / {maxSelection} selected
      </span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={selectedCount === 0} onClick={onAdd}>
          Add {selectedCount > 0 ? `${selectedCount}` : ""} →
        </Button>
      </div>
    </div>
  );
}
