"use client";

import type { ParamSpec } from "@/lib/image-gen/types";
import { Slider } from "@/components/ui/slider";

type Props = { spec: ParamSpec; value: unknown; onChange: (v: unknown) => void };

export function SliderControl({ spec, value, onChange }: Props) {
  if (spec.constraints.type !== "slider") return null;
  const { min, max, step = 1 } = spec.constraints;
  const current =
    typeof value === "number" ? value
    : typeof spec.defaultValue === "number" ? spec.defaultValue
    : min;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Slider
        min={min}
        max={max}
        step={step}
        value={current}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
        className="flex-1"
      />
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {current}
      </span>
    </div>
  );
}
