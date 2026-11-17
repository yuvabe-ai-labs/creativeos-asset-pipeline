"use client";

import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PanelImage } from "./panel-image";

/** The panel view's frame (D489): the take on screen at the full height of the dialog, its width
 *  from the reel's aspect. While a take draws, the current one stays in view, veiled (YUV-422). */
export function PanelDialogFrame({ url, alt, aspect, busy, hasPick }: {
  url: string | null;
  alt: string;
  aspect: string;
  busy: boolean;
  hasPick: boolean;
}) {
  return (
    <div className="flex min-h-0 justify-center md:h-full">
      <div
        className={cn(
          "relative h-[55vh] max-w-full overflow-hidden rounded-lg border border-border bg-muted/30 md:h-full",
          !url && !busy && "border-dashed",
        )}
        style={{ aspectRatio: aspect.replace(":", " / ") }}
      >
        {url ? <PanelImage src={url} alt={alt} /> : busy && <Skeleton className="absolute inset-0 rounded-none" />}
        {!url && !busy && (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">No panel yet</span>
        )}
        {busy && (
          <div role="status" className="absolute inset-0 flex items-center justify-center gap-1.5 bg-background/60 text-xs font-medium text-foreground backdrop-blur-sm">
            <Loader2 className="size-3.5 animate-spin text-primary" strokeWidth={1.5} />
            {hasPick ? "Drawing a new take…" : "Drawing…"}
          </div>
        )}
      </div>
    </div>
  );
}
