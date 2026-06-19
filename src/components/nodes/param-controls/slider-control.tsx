"use client";

import type { UseFormReturn } from "react-hook-form";
import type { ParamSpec } from "@/lib/image-gen/types";
import { Slider } from "@/components/ui/slider";

type Props = { spec: ParamSpec; form: UseFormReturn<Record<string, unknown>> };

export function SliderControl({ spec, form }: Props) {
  if (spec.constraints.type !== "slider") return null;
  const { min, max, step = 1 } = spec.constraints;
  const raw = form.watch(spec.name);
  const value = typeof raw === "number" ? raw : typeof spec.defaultValue === "number" ? spec.defaultValue : min;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        onValueChange={(v) =>
          form.setValue(spec.name as never, (Array.isArray(v) ? v[0] : v) as never, { shouldDirty: true })
        }
        className="flex-1"
      />
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {value}
      </span>
    </div>
  );
}
