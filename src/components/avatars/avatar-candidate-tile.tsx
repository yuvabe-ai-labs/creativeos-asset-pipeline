"use client";

import { Loader2, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AvatarCandidate } from "@/lib/avatars/schema";

type Props = {
  candidate: AvatarCandidate;
  isFront: boolean;
  isPicking: boolean;
  disabled: boolean;
  onPick: () => void;
  onZoom: () => void;
};

// One generated image. The checkbox in its corner says plainly which one is the front: ticking
// another moves the front to it. The whole image is a target too, and the corner button opens it
// full size. A front can't be unticked — the avatar always needs one once it has it.
export function AvatarCandidateTile({ candidate, isFront, isPicking, disabled, onPick, onZoom }: Props) {
  // Re-picking the current front is a no-op on the server too (D291 review), but skipping the
  // call here also skips the brief "picking" spinner state.
  const pick = () => { if (!isFront) onPick(); };
  const checkboxId = `candidate-${candidate.generationId}`;

  return (
    <div className="group/tile relative aspect-[3/4]">
      {/* The checkbox is the accessible control; the image is a larger pointer target for it. */}
      <Button
        variant="ghost"
        disabled={disabled}
        aria-hidden
        tabIndex={-1}
        onClick={pick}
        className={cn(
          "size-full overflow-hidden rounded-lg border p-0",
          isFront && "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background",
          // The one being picked stays bright while the rest dim.
          isPicking && "disabled:opacity-100",
        )}
      >
        {/* Under the image until it has downloaded; the image covers it once it paints. */}
        <Skeleton className="absolute inset-0 rounded-none" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={candidate.url} alt="" loading="lazy" decoding="async" className="relative size-full object-cover" />
        {isPicking && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/60 text-xs font-medium text-foreground">
            <Loader2 className="size-5 animate-spin text-primary" strokeWidth={1.5} />
            Setting as the front…
          </span>
        )}
      </Button>

      <label
        htmlFor={checkboxId}
        className={cn(
          "absolute left-1.5 top-1.5 flex cursor-pointer items-center gap-1.5 rounded-md bg-card/95 px-1.5 py-1 text-xs font-medium shadow-card backdrop-blur-sm",
          isFront ? "text-primary" : "text-foreground/80",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <Checkbox
          id={checkboxId}
          checked={isFront}
          disabled={disabled}
          onCheckedChange={(checked) => { if (checked) pick(); }}
          aria-label={isFront ? "The front image" : "Use as the front image"}
          className="bg-card"
        />
        {isFront ? "Front" : "Use"}
      </label>

      <Button
        variant="outline"
        size="icon-sm"
        aria-label="View full size"
        onClick={onZoom}
        className={cn(
          "absolute right-1.5 top-1.5 bg-card/90 backdrop-blur-sm",
          // Revealed on hover or focus with a pointer; always there on touch screens.
          "opacity-100 transition-opacity sm:opacity-0 sm:group-hover/tile:opacity-100 sm:focus-visible:opacity-100",
        )}
      >
        <Maximize2 className="size-3.5" strokeWidth={1.5} />
      </Button>
    </div>
  );
}
