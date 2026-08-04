"use client";

import { Palette } from "lucide-react";

export function PostBrandTabStub() {
  return (
    <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
      <Palette className="size-6 text-muted-foreground/40" strokeWidth={1.5} />
      <p className="text-xs text-muted-foreground">
        Brand Kit is coming soon — colours, fonts, logos, and icons pulled straight from the
        client's brand profile.
      </p>
    </div>
  );
}
