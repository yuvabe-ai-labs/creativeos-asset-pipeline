"use client";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import type { PostLayer } from "@/lib/post/types";

type Props = {
  layer: PostLayer;
  onChange: (patch: Partial<PostLayer>) => void;
  /** Live update while a slider is dragged; onChange lands the single undo entry. */
  onPreview: (patch: Partial<PostLayer>) => void;
};

/** Base UI sliders hand back an array for range sliders and a number for single ones. */
export function sliderValue(v: number | readonly number[]): number {
  return Array.isArray(v) ? v[0] : (v as number);
}

/**
 * Corner radius reads as words rather than a raw px count (D125). Shared by the shape and
 * image inspectors, which offer the same control over different maximums.
 */
export function cornerLabel(radius: number, max: number): string {
  if (radius >= max) return "Pill";
  if (radius === 0) return "Sharp";
  return "Rounded";
}

/**
 * The properties every layer kind has, in one block below the kind-specific controls.
 *
 * Both live on LayerBase and both are honoured by the renderer for all five kinds, but
 * neither had any UI: opacity was unreachable entirely, and rotation only via the canvas
 * rotate handle — which cannot be undone precisely or nudged to a round number.
 */
export function PostInspectorCommon({ layer, onChange, onPreview }: Props) {
  const opacity = layer.opacity ?? 1;
  const rotation = layer.rotation ?? 0;

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">
          Opacity — {Math.round(opacity * 100)}%
        </label>
        <Slider
          min={0} max={100} step={1}
          value={[Math.round(opacity * 100)]}
          onValueChange={(v) => onPreview({ opacity: sliderValue(v) / 100 })}
          onValueCommitted={(v) => onChange({ opacity: sliderValue(v) / 100 })}
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="text-eyebrow !text-[0.6rem]">Rotation — {Math.round(rotation)}°</label>
          {/* Getting back to true by dragging is fiddly — a rotate handle rarely lands on
              exactly 0. One click is the whole point of this button. */}
          {Math.round(rotation) !== 0 && (
            <Button
              variant="ghost" size="sm"
              className="h-auto px-1.5 py-0.5 text-[0.6rem]"
              onClick={() => onChange({ rotation: 0 })}
            >
              Straighten
            </Button>
          )}
        </div>
        <Slider
          min={-180} max={180} step={1}
          value={[Math.round(rotation)]}
          onValueChange={(v) => onPreview({ rotation: sliderValue(v) })}
          onValueCommitted={(v) => onChange({ rotation: sliderValue(v) })}
        />
      </div>
    </div>
  );
}
