"use client";

import { Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGalleryDrawer } from "./gallery-drawer-context";

export function GalleryDrawerTrigger() {
  const { toggleDrawer } = useGalleryDrawer();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleDrawer}
      className="h-8 gap-1.5 rounded-full px-3 text-xs shadow-sm"
    >
      <Images className="size-3.5" strokeWidth={1.5} />
      Gallery
    </Button>
  );
}
