"use client";

import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PanelView } from "@/lib/scripts/visualise/state";
import { PanelImage } from "./panel-image";

// Spec §6.4 — one frame, the same size in every state, so nothing moves when a panel lands.
// D465 — a picture, not a button: the sheet does not zoom; the panel's actions sit on its frame.
export function PanelFrame({ view, aspect, label, description }: {
  view: PanelView;
  aspect: string;
  label: string;
  /** The shot's visual line: while drawing, the placeholder says what is being drawn. */
  description: string;
}) {
  const style = { aspectRatio: aspect.replace(":", " / ") };
  const box = "relative w-full overflow-hidden rounded-lg";

  if (view.status === "generating") {
    return (
      <div role="status" className={cn(box, "border border-border bg-muted")} style={style} aria-label={`${label}: drawing`}>
        <Skeleton className="absolute inset-0 rounded-none" />
        {/* What is being drawn, not just that something is (asked for in testing). */}
        <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3">
          {/* No "Drawing…" word here: the panel's button and Generate all already say it. */}
          <Loader2 className="size-3.5 animate-spin text-primary" strokeWidth={1.5} />
          <span className="line-clamp-5 text-xs leading-snug text-muted-foreground">{description}</span>
        </span>
      </div>
    );
  }
  if (view.pick?.url) {
    // The box sets the size, never the image: models return other shapes (GPT Image 2's "9:16"
    // is about 2:3), which made drawn tiles taller than empty ones (testing).
    return (
      <div className={cn(box, "border border-border")} style={style}>
        <PanelImage src={view.pick.url} alt={`${label} panel`} className={view.status === "out_of_date" ? "opacity-60" : undefined} />
      </div>
    );
  }
  return (
    <div
      className={cn(box, "flex items-center justify-center bg-card text-xs text-muted-foreground", view.canGenerate ? "border border-dashed border-primary/40" : "border border-border")}
      style={style}
      aria-label={`${label}: no panel yet`}
    >
      Not drawn yet
    </div>
  );
}
