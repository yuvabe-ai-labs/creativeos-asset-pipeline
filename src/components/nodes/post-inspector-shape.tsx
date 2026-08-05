"use client";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ShapeLayer } from "@/lib/post/types";
import { PostColourSwatches } from "./post-colour-swatches";
import { PostGradientPresets } from "./post-gradient-presets";
import { makeGradientFill } from "@/lib/post/gradients";

type Props = { layer: ShapeLayer; onChange: (patch: Partial<ShapeLayer>) => void };

/** Corner radius reads as words ("Sharp"/"Rounded"/"Pill") rather than a raw px count (D125). */
const CORNER_MAX = 120;

export function PostInspectorShape({ layer, onChange }: Props) {
  const isGradient = layer.fill.kind === "gradient";

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
        />
      ) : (
        <PostGradientPresets
          from={layer.fill.from}
          to={layer.fill.to}
          angle={layer.fill.angle}
          onChange={(fill) => onChange({ fill })}
        />
      )}

      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">
          Corners — {layer.radius >= CORNER_MAX ? "Pill" : layer.radius === 0 ? "Sharp" : "Rounded"}
        </label>
        <Slider
          min={0} max={CORNER_MAX} step={1}
          value={[Math.min(layer.radius, CORNER_MAX)]}
          onValueChange={(v) => {
            const n = Array.isArray(v) ? v[0] : v;
            onChange({ radius: n >= CORNER_MAX ? 999 : n });
          }}
        />
      </div>

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
          />
          <div>
            <label className="text-eyebrow mb-1 block !text-[0.6rem]">
              Border thickness — {layer.stroke.width}
            </label>
            <Slider
              min={1} max={40} step={1}
              value={[layer.stroke.width]}
              onValueChange={(v) =>
                onChange({ stroke: { ...layer.stroke!, width: Array.isArray(v) ? v[0] : v } })
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
