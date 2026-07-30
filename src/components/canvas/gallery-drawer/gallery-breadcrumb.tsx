"use client";

import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FolderFrame } from "@/hooks/use-drive-browser";

type Props = {
  stack: FolderFrame[];
  onNavigateTo: (index: number) => void;
};

export function GalleryBreadcrumb({ stack, onNavigateTo }: Props) {
  if (stack.length <= 1) return null;
  return (
    <div className="flex shrink-0 items-center gap-0.5 border-b border-border px-4 py-1.5 text-xs text-muted-foreground overflow-x-auto">
      {stack.map((frame, i) => (
        <span key={frame.id} className="flex items-center gap-0.5 shrink-0">
          {i > 0 && <ChevronRight className="size-3 shrink-0" strokeWidth={1.5} />}
          {i < stack.length - 1 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onNavigateTo(i)}
            >
              {frame.name}
            </Button>
          ) : (
            <span className="px-1 py-0.5 font-medium text-foreground">{frame.name}</span>
          )}
        </span>
      ))}
    </div>
  );
}
