"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ImageLayer } from "@/lib/post/types";

type Props = { layer: ImageLayer; onChange: (patch: Partial<ImageLayer>) => void };

export function PostInspectorImage({ layer, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">Fit</label>
        <div className="flex gap-1">
          {(["cover", "contain"] as const).map((fit) => (
            <Button
              key={fit} variant="outline" size="sm"
              className={cn(layer.fit === fit && "ring-2 ring-primary ring-offset-1")}
              onClick={() => onChange({ fit })}
            >
              {fit === "cover" ? "Fill" : "Fit"}
            </Button>
          ))}
        </div>
      </div>
      {layer.src.kind === "node" && (
        <p className="text-xs text-muted-foreground">
          Live-linked to a connected node — regenerating it updates this image automatically.
        </p>
      )}
    </div>
  );
}
