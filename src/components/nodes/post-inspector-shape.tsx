"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ShapeLayer } from "@/lib/post/types";

type Props = { layer: ShapeLayer; onChange: (patch: Partial<ShapeLayer>) => void };

export function PostInspectorShape({ layer, onChange }: Props) {
  const isGradient = layer.fill.kind === "gradient";
  const gradientFrom = layer.fill.kind === "gradient" ? layer.fill.from : "";
  const gradientTo = layer.fill.kind === "gradient" ? layer.fill.to : "";

  const [fromDraft, setFromDraft] = useState(gradientFrom);
  useEffect(() => setFromDraft(gradientFrom), [gradientFrom]);

  const [toDraft, setToDraft] = useState(gradientTo);
  useEffect(() => setToDraft(gradientTo), [gradientTo]);

  const [radiusDraft, setRadiusDraft] = useState(String(layer.radius));
  useEffect(() => setRadiusDraft(String(layer.radius)), [layer.radius]);

  const [strokeWidthDraft, setStrokeWidthDraft] = useState(String(layer.stroke?.width ?? 2));
  useEffect(() => setStrokeWidthDraft(String(layer.stroke?.width ?? 2)), [layer.stroke?.width]);

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
              type="text" value={fromDraft}
              onChange={(e) => setFromDraft(e.target.value)}
              onBlur={() => onChange({ fill: { ...layer.fill as Extract<ShapeLayer["fill"], { kind: "gradient" }>, from: fromDraft } })}
              className="text-xs"
            />
          </div>
          <div className="flex-1">
            <label className="text-eyebrow mb-1 block !text-[0.6rem]">To</label>
            <Input
              type="text" value={toDraft}
              onChange={(e) => setToDraft(e.target.value)}
              onBlur={() => onChange({ fill: { ...layer.fill as Extract<ShapeLayer["fill"], { kind: "gradient" }>, to: toDraft } })}
              className="text-xs"
            />
          </div>
        </div>
      )}
      <div>
        <label className="text-eyebrow mb-1 block !text-[0.6rem]">Corner radius</label>
        <Input
          type="number" min={0} max={999} value={radiusDraft}
          onChange={(e) => setRadiusDraft(e.target.value)}
          onBlur={() => onChange({ radius: Number(radiusDraft) })}
          className="text-xs"
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
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-eyebrow mb-1 block !text-[0.6rem]">Colour</label>
            <Input
              type="color" value={layer.stroke.color}
              onChange={(e) => onChange({ stroke: { ...layer.stroke!, color: e.target.value } })}
              className="h-8 w-full p-1"
            />
          </div>
          <div className="flex-1">
            <label className="text-eyebrow mb-1 block !text-[0.6rem]">Width</label>
            <Input
              type="number" min={0} max={40} value={strokeWidthDraft}
              onChange={(e) => setStrokeWidthDraft(e.target.value)}
              onBlur={() => onChange({ stroke: { ...layer.stroke!, width: Number(strokeWidthDraft) } })}
              className="text-xs"
            />
          </div>
        </div>
      )}
    </div>
  );
}
