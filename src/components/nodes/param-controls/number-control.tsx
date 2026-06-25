"use client";

import type { ParamSpec } from "@/lib/image-gen/types";

const INPUT_CLS =
  "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

type Props = { spec: ParamSpec; value: unknown; onChange: (v: unknown) => void };

export function NumberControl({ spec, value, onChange }: Props) {
  if (spec.constraints.type !== "number") return null;
  const { min, max, step } = spec.constraints;
  const current =
    typeof value === "number" ? value
    : typeof spec.defaultValue === "number" ? spec.defaultValue
    : "";

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={current}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      className={INPUT_CLS}
    />
  );
}
