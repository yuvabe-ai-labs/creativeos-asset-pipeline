"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ShapeLayer } from "@/lib/post/types";

type Props = { layer: ShapeLayer; onChange: (patch: Partial<ShapeLayer>) => void };

export function PostInspectorShape({ layer, onChange }: Props) {
  const isGradient = layer.fill.kind === "gradient";
  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        <Button
          variant="outline" size="sm"
          className={cn(!isGradient && "ring-2 ring-primary ring-offset-1")}
          onClick={() =>
            onChange({
              fill: {
                kind: "solid",
                color: isGradient
                  ? (layer.fill as Extract<ShapeLayer["fill"], { kind: "gradient" }>).to
                  : (layer.fill as Extract<ShapeLayer["fill"], { kind: "solid" }>).color,
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
            onChange({
              fill: isGradient
                ? layer.fill
                : {
                    kind: "gradient",
                    from: "rgba(0,0,0,0)",
                    to: (layer.fill as Extract<ShapeLayer["fill"], { kind: "solid" }>).color,
                    angle: 0,
                  },
            })
          }
        >
          Gradient
        </Button>
      </div>
      {layer.fill.kind === "solid" ? (
        <div>
          <label className="text-eyebrow mb-1 block !text-[0.6rem]">Colour</label>
          <Input
            type="color" value={layer.fill.color}
            onChange={(e) => onChange({ fill: { kind: "solid", color: e.target.value } })}
            className="h-8 w-full p-1"
          />
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-eyebrow mb-1 block !text-[0.6rem]">From</label>
            <Input
              type="text" value={layer.fill.from}
              onChange={(e) => onChange({ fill: { ...layer.fill as Extract<ShapeLayer["fill"], { kind: "gradient" }>, from: e.target.value } })}
              className="text-xs"
            />
          </div>
          <div className="flex-1">
            <label className="text-eyebrow mb-1 block !text-[0.6rem]">To</label>
            <Input
              type="text" value={layer.fill.to}
              onChange={(e) => onChange({ fill: { ...layer.fill as Extract<ShapeLayer["fill"], { kind: "gradient" }>, to: e.target.value } })}
              className="text-xs"
            />
          </div>
        </div>
      )}
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">Corner radius</label>
        <Input
          type="number" min={0} max={999} value={layer.radius}
          onChange={(e) => onChange({ radius: Number(e.target.value) })}
          className="text-xs"
        />
      </div>
    </div>
  );
}
