"use client";

import type { ParamSpec } from "@/lib/image-gen/types";
import { Switch } from "@/components/ui/switch";

type Props = { spec: ParamSpec; value: unknown; onChange: (v: unknown) => void };

export function ToggleControl({ spec, value, onChange }: Props) {
  if (spec.constraints.type !== "toggle") return null;
  const checked = typeof value === "boolean" ? value : Boolean(spec.defaultValue);

  return <Switch checked={checked} onCheckedChange={(v) => onChange(v)} />;
}
