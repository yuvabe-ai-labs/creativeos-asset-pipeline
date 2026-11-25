import "server-only";
import {
  generateWithKling, klingEndpoint, build3_0Settings, buildO1Settings, build30OmniSettings,
  type KlingSettingsBuilder,
} from "./providers/kling";
import type { KlingFalModel } from "./providers/kling-fal";
import { generateWithSeedance } from "./providers/seedance";
import { generateWithOmni, OMNI_11, OMNI_12, type OmniVersion } from "./providers/gemini-omni";
import type { VideoAdapter } from "./types";

// D561 — the code that calls each video model's provider, by its catalog row's adapter_key. The
// model's data (params, rules, image inputs, duration) comes from the row; the provider's model
// name is the row's provider_model_id. Retired models (Veo) have no adapter: they cannot run.

// On fal the model is addressed by its fal key (`model`), not by provider_model_id: that column
// holds the Kling API's own name, which only the native transport's endpoint path uses.
const kling =
  (model: KlingFalModel, settings: KlingSettingsBuilder): VideoAdapter =>
  (input, { spec, providerModelId }) =>
    generateWithKling(klingEndpoint(model, providerModelId, spec.imageInputs.maxReferenceImages), settings, input);

// Each version's length limits stay in code; the API model name comes from the row.
const omni =
  (version: OmniVersion): VideoAdapter =>
  (input, { providerModelId }) =>
    generateWithOmni(input, { ...version, apiModel: providerModelId });

export const videoAdapters: Readonly<Record<string, VideoAdapter>> = {
  "video:kling-3-0": kling("kling-3-0", build3_0Settings),
  "video:kling-o1": kling("kling-o1", buildO1Settings),
  "video:kling-3-0-omni": kling("kling-3-0-omni", build30OmniSettings),
  "video:seedance-2-5": (input, { spec, providerModelId }) =>
    generateWithSeedance(input, spec.imageInputs.maxReferenceImages, providerModelId),
  "video:gemini-omni-1.2-flash": omni(OMNI_12),
  "video:gemini-omni-1.1-flash": omni(OMNI_11),
};
