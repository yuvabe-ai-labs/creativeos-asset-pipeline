"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  onDelete: () => void;
  className?: string;
};

export function NodeDeleteButton({ onDelete, className }: Props) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}
      // nodrag/nopan: prevent the click from triggering canvas drag or pan
      className={cn(
        "nodrag nopan",
        "invisible group-hover:visible",
        "flex items-center justify-center rounded",
        "p-0.5 transition-[color,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "text-muted-foreground/50 hover:text-destructive",
        className,
      )}
      aria-label="Delete node"
      tabIndex={-1}
    >
      <X className="size-3" strokeWidth={1.5} />
    </button>
  );
}
