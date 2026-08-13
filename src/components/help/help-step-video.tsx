"use client";

import { useState } from "react";
import { Clapperboard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { HelpStep } from "@/lib/help/types";

// Muted autoplay video rather than a GIF — visually identical, roughly an order of
// magnitude smaller, and it degrades to a paused first frame when autoplay is blocked.
// `key` forces a remount so switching steps restarts the clip instead of resuming it.
export function HelpStepVideo({ step }: { step: HelpStep }) {
  // Which clip has finished loading, rather than a boolean. Stepping through a chapter
  // swaps `step` without remounting this component, so a boolean would stay true from the
  // previous clip and the new one would pop in unannounced. Comparing against the current
  // src resets the skeleton on every change with no effect and no stale state.
  const [loadedClip, setLoadedClip] = useState<string | null>(null);
  const isLoaded = loadedClip === step.clip;

  if (!step.clip) {
    // Authored but not yet recorded. A <video> with an empty src requests the page itself
    // and renders a broken frame, so the pane says plainly that there is no clip — the
    // step's title and body beside it are still the real answer.
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-border bg-muted/30 p-3">
        <div className="flex flex-col items-center gap-2 px-6 text-center">
          <Clapperboard
            className="size-5 text-muted-foreground/50"
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="text-sm text-muted-foreground">
            No clip for this step yet — the steps on the left cover it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full items-center justify-center rounded-xl border border-border bg-muted/30 p-3">
      {/* Sits over the video rather than replacing it: the <video> has to stay mounted to
          load at all, and swapping it out on ready would restart that work. */}
      {!isLoaded && (
        <Skeleton className="absolute inset-3 rounded-lg" aria-hidden />
      )}

      <video
        key={step.clip}
        src={step.clip}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        aria-label={step.title}
        aria-busy={!isLoaded}
        // onCanPlay, not onLoadedMetadata: metadata fires once dimensions are known, which
        // is well before there are frames to show, so the skeleton would clear onto a blank
        // box. onError clears it too — a failed clip should fall back to the browser's own
        // broken-media state rather than shimmer forever.
        onCanPlay={() => setLoadedClip(step.clip)}
        onError={() => setLoadedClip(step.clip)}
        className={cn(
          "max-h-full w-full rounded-lg object-contain shadow-card",
          "transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          isLoaded ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
