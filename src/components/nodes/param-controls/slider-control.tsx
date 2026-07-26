"use client";

import type { ParamSpec } from "@/lib/image-gen/types";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

type Props = {
  spec: ParamSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
};

export function SliderControl({ spec, value, onChange, disabled }: Props) {
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
        disabled={disabled}
        className="flex-1"
      />
      <span
        className={cn(
          "w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground",
          disabled && "opacity-50",
        )}
      >
        {current}
      </span>
    </div>
  );
}
