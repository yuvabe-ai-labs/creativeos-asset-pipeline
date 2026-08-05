"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

export function PostInspectorImage({ layer, onChange, naturalSize }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">How the image fills its box</label>
        <div className="flex gap-1">
          {(["cover", "contain"] as const).map((fit) => (
            <Button
              key={fit} variant="outline" size="sm"
              className={cn(layer.fit === fit && "ring-2 ring-primary ring-offset-1")}
              onClick={() => onChange({ fit })}
            >
              {fit === "cover" ? "Fill the box" : "Fit inside"}
            </Button>
          ))}
        </div>
      </div>
      {layer.src.kind === "node" && (
        <p className="text-xs text-muted-foreground">
          Live-linked to a connected node — regenerating it updates this image automatically.
        </p>
      )}
      {naturalSize && (
        <Button
          variant="outline" size="sm"
          onClick={() => onChange(computeNaturalRatioReset(
            { x: layer.x, y: layer.y, w: layer.w, h: layer.h }, naturalSize.width, naturalSize.height,
          ))}
        >
          Reset to original proportions
        </Button>
      )}
    </div>
  );
}
