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

// Accepts numeric strings as well as numbers: a param that used to be a select persisted its
// value as a string (e.g. duration "10"), and falling back to the default would silently
// change a saved setting while still generating at the stored value.
function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function SliderControl({ spec, value, onChange, disabled }: Props) {
  if (spec.constraints.type !== "slider") return null;
  const { min, max, step = 1 } = spec.constraints;
  const current = toNumber(value) ?? toNumber(spec.defaultValue) ?? min;

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
