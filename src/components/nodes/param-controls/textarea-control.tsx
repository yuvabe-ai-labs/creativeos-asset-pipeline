"use client";

import type { UseFormReturn } from "react-hook-form";
import type { ParamSpec } from "@/lib/image-gen/types";

const TEXTAREA_CLS =
  "min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none";

type Props = { spec: ParamSpec; form: UseFormReturn<Record<string, unknown>> };

export function TextareaControl({ spec, form }: Props) {
  if (spec.constraints.type !== "textarea") return null;
  const raw = form.watch(spec.name);
  const value = typeof raw === "string" ? raw : typeof spec.defaultValue === "string" ? spec.defaultValue : "";

  return (
    <textarea
      rows={3}
      maxLength={spec.constraints.maxLength}
      value={value}
      onChange={(e) =>
        form.setValue(spec.name as never, e.target.value as never, { shouldDirty: true })
      }
      className={TEXTAREA_CLS}
    />
  );
}
