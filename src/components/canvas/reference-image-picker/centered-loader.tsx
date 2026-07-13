"use client";

import { Loader2 } from "lucide-react";

export function CenteredLoader() {
  return (
    <div className="flex h-48 items-center justify-center">
      <Loader2
        className="size-6 animate-spin text-muted-foreground"
        strokeWidth={1.5}
      />
    </div>
  );
}
