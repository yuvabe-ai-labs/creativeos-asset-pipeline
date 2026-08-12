import type { ClientModelSpec } from "./types";
import { PRODUCT_DETAIL_SUFFIX } from "./constants";

/**
 * Append the default product-detail instruction to a prompt on its way to the model.
 * Idempotent — a prompt that already ends with the suffix (e.g. an operator hand-edited
 * an earlier attempt's recorded prompt and re-ran it) is returned unchanged.
 */
export function withProductDetailSuffix(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return PRODUCT_DETAIL_SUFFIX;
  if (trimmed.endsWith(PRODUCT_DETAIL_SUFFIX)) return trimmed;
  const separator = /[.!?]$/.test(trimmed) ? " " : ". ";
  return `${trimmed}${separator}${PRODUCT_DETAIL_SUFFIX}`;
}

export function enumOptions(model: ClientModelSpec, field: string): string[] {
  const spec = model.params.find((p) => p.name === field);
  if (spec?.constraints.type === "select") return spec.constraints.options;
  return [];
}
