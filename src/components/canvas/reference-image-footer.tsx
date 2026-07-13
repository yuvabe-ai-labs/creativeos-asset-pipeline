"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  selectedCount: number;
  onAdd: () => void;
  onCancel: () => void;
};

export function ReferenceImageFooter({ selectedCount, onAdd, onCancel }: Props) {
  return (
    <div className="flex items-center justify-between border-t border-border bg-card px-5 py-3">
      <div className="min-w-[80px]">
        {selectedCount > 0 && (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
              "bg-primary/10 text-primary",
            )}
          >
            {selectedCount} selected
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={selectedCount === 0}
          onClick={onAdd}
        >
          Add {selectedCount > 0 ? `${selectedCount} image${selectedCount > 1 ? "s" : ""}` : "images"} →
        </Button>
      </div>
    </div>
  );
}
