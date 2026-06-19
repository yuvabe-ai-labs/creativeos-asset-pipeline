"use client";

import type { UseFormReturn } from "react-hook-form";
import type { ParamSpec } from "@/lib/image-gen/types";

const INPUT_CLS =
  "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

type Props = { spec: ParamSpec; form: UseFormReturn<Record<string, unknown>> };

export function NumberControl({ spec, form }: Props) {
  if (spec.constraints.type !== "number") return null;
  const { min, max, step } = spec.constraints;
  const raw = form.watch(spec.name);
  const value = typeof raw === "number" ? raw : typeof spec.defaultValue === "number" ? spec.defaultValue : "";

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => {
        const n = e.target.value === "" ? undefined : Number(e.target.value);
        form.setValue(spec.name as never, n as never, { shouldDirty: true });
      }}
      className={INPUT_CLS}
    />
  );
}
