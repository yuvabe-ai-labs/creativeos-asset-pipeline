"use client";

import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ViewMode } from "./types";

type Props = {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
};

const OPTIONS: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  { id: "grid", label: "Grid", icon: <LayoutGrid className="size-3.5" strokeWidth={1.5} /> },
  { id: "list", label: "List", icon: <List className="size-3.5" strokeWidth={1.5} /> },
];

export function ViewModeToggle({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
      {OPTIONS.map((opt) => (
        <Button
          key={opt.id}
          variant="ghost"
          size="sm"
          onClick={() => onChange(opt.id)}
          className={cn(
            "h-6 gap-1.5 rounded-sm px-2 text-xs",
            value === opt.id
              ? "bg-background text-foreground shadow-sm hover:bg-background"
              : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
          )}
        >
          {opt.icon}
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
