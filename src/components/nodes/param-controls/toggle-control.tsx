"use client";

import type { UseFormReturn } from "react-hook-form";
import type { ParamSpec } from "@/lib/image-gen/types";
import { Switch } from "@/components/ui/switch";

type Props = { spec: ParamSpec; form: UseFormReturn<Record<string, unknown>> };

export function ToggleControl({ spec, form }: Props) {
  if (spec.constraints.type !== "toggle") return null;
  const raw = form.watch(spec.name);
  const checked = typeof raw === "boolean" ? raw : Boolean(spec.defaultValue);

  return (
    <Switch
      checked={checked}
      onCheckedChange={(v) =>
        form.setValue(spec.name as never, v as never, { shouldDirty: true })
      }
    />
  );
}
