"use client";

import type { ParamSpec } from "@/lib/image-gen/types";

const TEXTAREA_CLS =
  "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none";

type Props = { spec: ParamSpec; value: unknown; onChange: (v: unknown) => void };

export function TextareaControl({ spec, value, onChange }: Props) {
  if (spec.constraints.type !== "textarea") return null;
  const current =
    typeof value === "string" ? value
    : typeof spec.defaultValue === "string" ? spec.defaultValue
    : "";

  return (
    <textarea
      rows={3}
      maxLength={spec.constraints.maxLength}
      value={current}
      onChange={(e) => onChange(e.target.value)}
      className={TEXTAREA_CLS}
    />
  );
}
