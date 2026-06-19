"use client";

import type { UseFormReturn } from "react-hook-form";
import type { ParamSpec } from "@/lib/image-gen/types";

const SELECT_CLS =
  "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

type Props = { spec: ParamSpec; form: UseFormReturn<Record<string, unknown>> };

export function SelectControl({ spec, form }: Props) {
  if (spec.constraints.type !== "select") return null;
  const value = String(form.watch(spec.name) ?? spec.defaultValue ?? "");

  return (
    <select
      value={value}
      onChange={(e) =>
        form.setValue(spec.name as never, e.target.value as never, { shouldDirty: true })
      }
      className={SELECT_CLS}
    >
      {spec.constraints.options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}
