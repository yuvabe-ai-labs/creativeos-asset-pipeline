"use client";

import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ViewMode } from "./types";

type Props = {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
};

export function GalleryViewToggle({ value, onChange }: Props) {
  return (
    <div className="flex items-center rounded-md border border-border p-0.5">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onChange("grid")}
        aria-label="Grid view"
        className={cn(
          "size-7 rounded-sm",
          value === "grid"
            ? "bg-primary/10 text-primary hover:bg-primary/10"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <LayoutGrid className="size-3.5" strokeWidth={1.5} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onChange("list")}
        aria-label="List view"
        className={cn(
          "size-7 rounded-sm",
          value === "list"
            ? "bg-primary/10 text-primary hover:bg-primary/10"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <List className="size-3.5" strokeWidth={1.5} />
      </Button>
    </div>
  );
}
