"use client";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { ImageLayer } from "@/lib/post/types";
import { computeNaturalRatioReset } from "@/lib/post/image-fit";
import { cornerLabel, sliderValue } from "./post-inspector-common";

/** Matches the shape inspector's, so a photo and a block round to the same degree. */
const CORNER_MAX = 120;

type Props = {
  layer: ImageLayer;
  onChange: (patch: Partial<ImageLayer>) => void;
  /** Live update while the corner slider is dragged; onChange lands the undo entry. */
  onPreview: (patch: Partial<ImageLayer>) => void;
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
export function PostInspectorImage({ layer, onChange, onPreview, naturalSize }: Props) {
  const radius = layer.radius ?? 0;
  return (
    <div className="space-y-3">
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">
          Corners — {cornerLabel(radius, CORNER_MAX)}
        </label>
        {/* Templates already round their photos through the same field; this is the first
            way to do it by hand, or to undo a template's rounding. */}
        <Slider
          min={0} max={CORNER_MAX} step={1}
          value={[Math.min(radius, CORNER_MAX)]}
          onValueChange={(v) => onPreview({ radius: sliderValue(v) })}
          onValueCommitted={(v) => onChange({ radius: sliderValue(v) })}
        />
      </div>
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
