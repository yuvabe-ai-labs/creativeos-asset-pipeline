// D552 — a catalog model as the spec shapes the app reads today, so Plan 1b can swap the
// registries for the catalog without touching their readers. Client-safe.
import type { ClientModelSpec } from "@/lib/image-gen/types";
import type { VideoGenClientModelSpec } from "@/lib/video-gen/types";
import { buildZodFromParams } from "@/lib/image-gen/schema-builder";
import type { ImageCapabilities, VideoCapabilities } from "./schema";
import type { AiModel } from "./types";

// D562 — checked on load (schema.ts), so these casts hold.
export function toImageClientSpec(model: AiModel): ClientModelSpec {
  return {
    ...(model.capabilities as ImageCapabilities),
    id: model.id,
    provider: model.provider,
    mediaType: "image",
    label: model.label,
    providerLabel: model.providerLabel,
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
    params: model.params,
    rules: model.rules,
  };
}
