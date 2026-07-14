"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GalleryTab } from "./types";

type Props = {
  value: GalleryTab;
  onChange: (tab: GalleryTab) => void;
};

const TABS: { id: GalleryTab; label: string }[] = [
  { id: "references", label: "References" },
  { id: "assets", label: "Assets" },
];

export function GalleryTabs({ value, onChange }: Props) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-4">
      {TABS.map((tab) => (
        <Button
          key={tab.id}
          variant="ghost"
          size="sm"
          onClick={() => onChange(tab.id)}
          className={cn(
            "h-7 rounded-md px-3 text-xs font-medium",
            value === tab.id
              ? "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  );
}
