"use client";

import { Combine } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/** D309 — the composite's current image, or what is about to fill it. */
export function CompositeOutputPane({ imageUrl, generating }: { imageUrl: string | null; generating: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-muted/40 p-6">
      {generating ? (
        <Skeleton className="aspect-[9/16] w-full max-w-sm rounded-xl" />
      ) : imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="Composite" className="max-h-full w-auto rounded-xl border border-border shadow-card" />
      ) : (
        <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
          <Combine className="size-6 text-primary" strokeWidth={1.5} />
          <p>Wire in an avatar, a background or a product — or none — and say what to make.</p>
        </div>
      )}
    </div>
  );
}
