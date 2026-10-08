"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PanelView } from "@/lib/scripts/visualise/state";

// Spec §6.4 — one frame, the same size in every state, so nothing moves when a panel lands.
export function PanelFrame({ view, aspect, label, onOpen }: { view: PanelView; aspect: string; label: string; onOpen: () => void }) {
  const style = { aspectRatio: aspect.replace(":", " / ") };
  const box = "relative w-full overflow-hidden rounded-lg";

  if (view.status === "generating") {
    return (
      <div className={cn(box, "border border-border bg-muted")} style={style} aria-label={`${label}: drawing`}>
        <Skeleton className="absolute inset-0 rounded-none" />
        <span className="absolute inset-x-0 bottom-2 text-center text-xs text-muted-foreground">Drawing…</span>
      </div>
    );
  }
  if (view.pick?.url) {
    // The box sets the size, never the image: models return other shapes (GPT Image 2's "9:16"
    // is about 2:3), which made drawn tiles taller than empty ones (testing).
    return (
      <div className={cn(box, "border border-border")} style={style}>
        <Button
          variant="ghost"
          aria-label={`Open the ${label} panel`}
          onClick={onOpen}
          className="absolute inset-0 h-full w-full cursor-zoom-in rounded-none p-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={view.pick.url} alt="" className={cn("absolute inset-0 size-full object-cover", view.status === "out_of_date" && "opacity-60")} />
        </Button>
      </div>
    );
  }
  return (
    <div
      className={cn(box, "bg-card", view.canGenerate ? "border border-dashed border-primary/40" : "border border-border")}
      style={style}
      aria-label={`${label}: no panel yet`}
    />
  );
}
