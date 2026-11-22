// D529 — a catalog model as the spec shapes the app reads today, so Plan 1b can swap the
// registries for the catalog without touching their readers. Client-safe.
import type { ClientModelSpec } from "@/lib/image-gen/types";
import type { VideoGenClientModelSpec } from "@/lib/video-gen/types";
import { buildZodFromParams } from "@/lib/image-gen/schema-builder";
import type { AiModel } from "./types";

type ImageCapabilities = Omit<
  ClientModelSpec,
  "id" | "provider" | "mediaType" | "label" | "providerLabel" | "deprecated" | "params" | "schema"
>;
type VideoCapabilities = Omit<
  VideoGenClientModelSpec,
  "id" | "provider" | "label" | "pickerLabel" | "providerLabel" | "deprecated" | "params" | "rules"
>;

export function toImageClientSpec(model: AiModel): ClientModelSpec {
  return {
    ...(model.capabilities as ImageCapabilities),
    id: model.id,
    provider: model.provider,
    mediaType: "image",
    label: model.label,
    providerLabel: model.providerLabel,
    ...(model.status === "retired" ? { deprecated: true } : {}),
    params: model.params,
    schema: buildZodFromParams(model.params),
  };
}

export function toVideoClientSpec(model: AiModel): VideoGenClientModelSpec {
  return {
    ...(model.capabilities as VideoCapabilities),
    id: model.id,
    provider: model.provider as VideoGenClientModelSpec["provider"],
    label: model.label,
    ...(model.pickerLabel ? { pickerLabel: model.pickerLabel } : {}),
    providerLabel: model.providerLabel,
    ...(model.status === "retired" ? { deprecated: true } : {}),
    params: model.params,
    rules: model.rules,
  };
}
