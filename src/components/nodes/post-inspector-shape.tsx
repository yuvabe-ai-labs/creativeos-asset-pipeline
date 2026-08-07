"use client";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ShapeLayer } from "@/lib/post/types";
import { PostColourSwatches } from "./post-colour-swatches";
import { PostGradientPresets } from "./post-gradient-presets";
import { makeGradientFill } from "@/lib/post/gradients";
import { cornerLabel, sliderValue } from "./post-inspector-common";

type Props = {
  layer: ShapeLayer;
  onChange: (patch: Partial<ShapeLayer>) => void;
  /** Live update while a slider is dragged; onChange lands the single undo entry. */
  onPreview: (patch: Partial<ShapeLayer>) => void;
};

const CORNER_MAX = 120;

export function PostInspectorShape({ layer, onChange, onPreview }: Props) {
  const isGradient = layer.fill.kind === "gradient";
  const shape = layer.shape ?? "rect";

  // A rule and an arrow have no interior — post-shape-layer.tsx draws them from their stroke
  // alone. Offering Fill, Gradient, Corners and a Border on/off for one was showing four
  // controls of which three did nothing and the fourth was mislabelled: what "Border colour"
  // actually set was the line's own colour. They get the two controls a line really has.
  const isStrokeOnly = shape === "line" || shape === "arrow";
  const stroke = layer.stroke ?? { color: "#1e1e1e", width: 6 };

  if (isStrokeOnly) {
    return (
      <div className="space-y-3">
        <PostColourSwatches
          label="Colour"
          value={stroke.color}
          onChange={(color) => onChange({ stroke: { ...stroke, color } })}
          onPreview={(color) => onPreview({ stroke: { ...stroke, color } })}
        />
        <div>
          <label className="text-eyebrow mb-1 block !text-[0.6rem]">
            Thickness — {stroke.width}
          </label>
          <Slider
            min={1} max={40} step={1}
            value={[stroke.width]}
            onValueChange={(v) => onPreview({ stroke: { ...stroke, width: sliderValue(v) } })}
            onValueCommitted={(v) => onChange({ stroke: { ...stroke, width: sliderValue(v) } })}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">Fill</label>
        <div className="flex gap-1">
          <Button
            variant="outline" size="sm"
            className={cn(!isGradient && "ring-2 ring-primary ring-offset-1")}
            onClick={() =>
              onChange({
                fill: {
                  kind: "solid",
                  color: layer.fill.kind === "gradient" ? layer.fill.to : layer.fill.color,
                },
              })
            }
          >
            Solid
          </Button>
          <Button
            variant="outline" size="sm"
            className={cn(isGradient && "ring-2 ring-primary ring-offset-1")}
            onClick={() =>
              onChange({ fill: isGradient ? layer.fill : makeGradientFill("dark-fade", "down") })
            }
          >
            Gradient
          </Button>
        </div>
      </div>

      {layer.fill.kind === "solid" ? (
        <PostColourSwatches
          label="Colour"
          value={layer.fill.color}
          onChange={(color) => onChange({ fill: { kind: "solid", color } })}
          onPreview={(color) => onPreview({ fill: { kind: "solid", color } })}
        />
      ) : (
        <PostGradientPresets
          from={layer.fill.from}
          to={layer.fill.to}
          angle={layer.fill.angle}
          onChange={(fill) => onChange({ fill })}
        />
      )}

      {/* Rectangles only. Konva takes cornerRadius on a Rect and nothing else, so
          post-shape-layer.tsx strips it for every other primitive — a Corners slider on an
          ellipse or a star moved a handle and changed nothing on the canvas. */}
      {shape === "rect" && (
        <div>
          <label className="text-eyebrow mb-1 block !text-[0.6rem]">
            Corners — {cornerLabel(layer.radius, CORNER_MAX)}
          </label>
          <Slider
            min={0} max={CORNER_MAX} step={1}
            value={[Math.min(layer.radius, CORNER_MAX)]}
            onValueChange={(v) => {
              const n = sliderValue(v);
              onPreview({ radius: n >= CORNER_MAX ? 999 : n });
            }}
            onValueCommitted={(v) => {
              const n = sliderValue(v);
              onChange({ radius: n >= CORNER_MAX ? 999 : n });
            }}
          />
        </div>
      )}

      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">Border</label>
        <div className="flex gap-1">
          <Button
            variant="outline" size="sm"
            className={cn(!layer.stroke && "ring-2 ring-primary ring-offset-1")}
            onClick={() => onChange({ stroke: undefined })}
          >
            None
          </Button>
          <Button
            variant="outline" size="sm"
            className={cn(layer.stroke && "ring-2 ring-primary ring-offset-1")}
            onClick={() => onChange({ stroke: layer.stroke ?? { color: "#1e1e1e", width: 2 } })}
          >
            Solid
          </Button>
        </div>
      </div>

      {layer.stroke && (
        <>
          <PostColourSwatches
            label="Border colour"
            value={layer.stroke.color}
            onChange={(color) => onChange({ stroke: { ...layer.stroke!, color } })}
            onPreview={(color) => onPreview({ stroke: { ...layer.stroke!, color } })}
          />
          <div>
            <label className="text-eyebrow mb-1 block !text-[0.6rem]">
              Border thickness — {layer.stroke.width}
            </label>
            <Slider
              min={1} max={40} step={1}
              value={[layer.stroke.width]}
              onValueChange={(v) => onPreview({ stroke: { ...layer.stroke!, width: sliderValue(v) } })}
              onValueCommitted={(v) => onChange({ stroke: { ...layer.stroke!, width: sliderValue(v) } })}
            />
          </div>
        </>
      )}
    </div>
  );
}
