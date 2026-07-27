"use client";

import type { ParamSpec } from "@/lib/image-gen/types";
import { Textarea } from "@/components/ui/textarea";

type Props = { spec: ParamSpec; value: unknown; onChange: (v: unknown) => void };

export function TextareaControl({ spec, value, onChange }: Props) {
  if (spec.constraints.type !== "textarea") return null;
  const current =
    typeof value === "string" ? value
    : typeof spec.defaultValue === "string" ? spec.defaultValue
    : "";

  // shadcn Textarea: w-full + field-sizing-content grow it to fill the row and
  // fit its content — replacing the native <textarea> that collapsed to its
  // intrinsic ~20-col width inside a non-flex parent.
  return (
    <Textarea
      rows={3}
      maxLength={spec.constraints.maxLength}
      value={current}
      onChange={(e) => onChange(e.target.value)}
      className="max-h-40 resize-none text-xs"
    />
  );
}
