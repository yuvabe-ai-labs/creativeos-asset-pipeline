"use client";

import { Folder, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FolderFrame } from "@/hooks/use-drive-browser";

type Props = {
  folder: FolderFrame;
  onClick: () => void;
};

export function GalleryFolderTile({ folder, onClick }: Props) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className="h-auto w-full justify-start gap-3 border-border bg-card px-3 py-2.5 text-left hover:bg-neutral-50"
    >
      <Folder className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
      <span className="flex-1 truncate text-sm font-medium">{folder.name}</span>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
    </Button>
  );
}
