"use client";

import { Play, ImageIcon, Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";

// A version's `output` is a URL — but for video-gen that is an .mp4, which is why the
// first cut of the drawer rendered a column of broken-image icons: an <img> cannot show
// a video. A <video preload="metadata"> paints its first frame, which is the thumbnail we
// want without generating posters server-side.
//
// muted + playsInline + no controls: this is a still, not a player. The play badge tells
// the reviewer it is footage; the actual playback happens in the focus view.
export function ReviewItemThumb({
  output,
  nodeType,
  size = 36,
  className,
}: {
  output: string | null;
  nodeType: string;
  size?: number;
  className?: string;
}) {
  const isVideo = nodeType === "video-gen";
  const box = cn(
    "relative shrink-0 overflow-hidden rounded-md border border-border bg-muted",
    className,
  );
  const style = { width: size, height: size };

  if (!output) {
    const Icon = isVideo ? Clapperboard : ImageIcon;
    return (
      <span className={box} style={style}>
        <span className="flex size-full items-center justify-center">
          <Icon className="size-4 text-muted-foreground/40" strokeWidth={1.5} />
        </span>
      </span>
    );
  }

  if (isVideo) {
    return (
      <span className={box} style={style}>
        <video
          src={output}
          preload="metadata"
          muted
          playsInline
          className="size-full object-cover"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/25">
          <Play className="size-3 fill-white text-white" strokeWidth={0} />
        </span>
      </span>
    );
  }

  return (
    <span className={box} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={output} alt="" className="size-full object-cover" />
    </span>
  );
}
