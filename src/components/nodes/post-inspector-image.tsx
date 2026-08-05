"use client";

import { Button } from "@/components/ui/button";
import type { ImageLayer } from "@/lib/post/types";
import { computeNaturalRatioReset } from "@/lib/post/image-fit";

type Props = {
  layer: ImageLayer;
  onChange: (patch: Partial<ImageLayer>) => void;
  // The image's natural bitmap size, if known — reported by post-image-layer.tsx via
  // onImageLoaded and threaded down to this component by a later integration task
  // (post-focus-view.tsx). Undefined until then, so the reset action stays hidden.
  naturalSize?: { width: number; height: number };
};

// No cover/contain control. It asked the operator to reason about a photo's aspect ratio
// against its box's — and either answer is a compromise: "cover" crops the photo, "contain"
// letterboxes it. Undo stretching by reshaping the BOX to the photo, below, and neither
// compromise arises. Every image stays on the "cover" it is created with, so a box resized by
// hand crops rather than distorting.
export function PostInspectorImage({ layer, onChange, naturalSize }: Props) {
  return (
    <div className="space-y-3">
      {naturalSize && (
        <div>
          <Button
            variant="outline" size="sm"
            onClick={() => onChange(computeNaturalRatioReset(
              { x: layer.x, y: layer.y, w: layer.w, h: layer.h }, naturalSize.width, naturalSize.height,
            ))}
          >
            Undo stretching
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            Reshapes the box to the picture&apos;s own proportions, so nothing is squashed.
          </p>
        </div>
      )}
      {layer.src.kind === "node" && (
        <p className="text-xs text-muted-foreground">
          Live-linked to a connected node — regenerating it updates this image automatically.
        </p>
      )}
    </div>
  );
}
