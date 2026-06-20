"use client";

import type { ParamSpec } from "@/lib/image-gen/types";

const SELECT_CLS =
  "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

type Props = { spec: ParamSpec; value: unknown; onChange: (v: unknown) => void };

export function SelectControl({ spec, value, onChange }: Props) {
  if (spec.constraints.type !== "select") return null;
  const current = String(value ?? spec.defaultValue ?? "");

  return (
    <select value={current} onChange={(e) => onChange(e.target.value)} className={SELECT_CLS}>
      {spec.constraints.options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}
