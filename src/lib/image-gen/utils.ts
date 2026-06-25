import type { ClientModelSpec } from "./types";

export function enumOptions(model: ClientModelSpec, field: string): string[] {
  const spec = model.params.find((p) => p.name === field);
  if (spec?.constraints.type === "select") return spec.constraints.options;
  return [];
}
