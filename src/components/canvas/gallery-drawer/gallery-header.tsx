"use client";

import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  onRefresh: () => void;
  onClose: () => void;
  refreshing: boolean;
};

export function GalleryHeader({ onRefresh, onClose, refreshing }: Props) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-5">
      <p className="font-display text-base font-semibold">Gallery</p>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh"
          className="size-8"
        >
          <RefreshCw
            className={refreshing ? "size-3.5 animate-spin" : "size-3.5"}
            strokeWidth={1.5}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close gallery"
          className="size-8"
        >
          <X className="size-4" strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}
