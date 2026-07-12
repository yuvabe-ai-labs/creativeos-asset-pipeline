import type { VideoGenClientModelSpec, ConstraintRule } from "./types";
import { veoParams, veoLiteParams } from "./params/veo";
import { soraParams } from "./params/sora";
import { klingLegacyParams, klingV3Params } from "./params/kling";

// ── Shared image input capability shapes ──────────────────────────────────────

const VEO_LITE_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 0,
} as const;

const VEO_REFS_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 3,
} as const;

// ── Constraint rules ──────────────────────────────────────────────────────────

const VEO_LITE_RULES: ConstraintRule[] = [
  {
    id: "lite-end-frame-duration",
    when: { field: "hasEndFrame", op: "eq", value: true },
    effect: { lockParams: [{ name: "duration", value: "8" }] },
    reason: "End frame selected → duration locked to 8s",
  },
  {
    id: "end-frame-requires-start-frame",
    when: {
      op: "and",
      conditions: [
        { field: "hasEndFrame", op: "eq", value: true },
        { field: "hasStartFrame", op: "eq", value: false },
      ],
    },
    effect: { disableGenerate: true },
    reason: "End frame needs a start frame before you can generate",
  },
];

const VEO_REFS_RULES: ConstraintRule[] = [
  {
    id: "refs-lock-duration-disable-frames",
    when: { field: "referenceCount", op: "gt", value: 0 },
    effect: {
      lockParams: [{ name: "duration", value: "8" }],
      disableFrameInputs: true,
    },
    reason: "Reference images selected → duration locked to 8s, start/end frames unavailable",
  },
  {
    id: "frames-disable-refs",
    when: {
      op: "or",
      conditions: [
        { field: "hasStartFrame", op: "eq", value: true },
        { field: "hasEndFrame", op: "eq", value: true },
      ],
    },
    effect: { disableRefs: true },
    reason: "Start/end frame selected → reference images unavailable",
  },
  {
    id: "end-frame-lock-duration",
    when: { field: "hasEndFrame", op: "eq", value: true },
    effect: { lockParams: [{ name: "duration", value: "8" }] },
    reason: "End frame selected → duration locked to 8s",
  },
  {
    id: "end-frame-requires-start-frame",
    when: {
      op: "and",
      conditions: [
        { field: "hasEndFrame", op: "eq", value: true },
        { field: "hasStartFrame", op: "eq", value: false },
      ],
    },
    effect: { disableGenerate: true },
    reason: "End frame needs a start frame before you can generate",
  },
];

const SORA_RULES: ConstraintRule[] = [
  {
    id: "sora-start-frame-locks-size",
    when: { field: "hasStartFrame", op: "eq", value: true },
    effect: { lockParams: [{ name: "size", value: "1280x720" }] },
    reason: "Start frame selected → output size locked to match your image",
  },
];

const KLING_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: false,
  maxReferenceImages: 0,
} as const;

// ── Model map ─────────────────────────────────────────────────────────────────

export const videoGenClientModelMap: Record<string, VideoGenClientModelSpec> = {
  "veo:veo-3.1-lite": {
    id: "veo:veo-3.1-lite",
    provider: "veo",
    label: "Veo 3.1 Lite",
    providerLabel: "Google",
    maxDurationSeconds: 8,
    imageInputs: VEO_LITE_IMAGE_INPUTS,
    params: veoLiteParams,
    rules: VEO_LITE_RULES,
  },
  "veo:veo-3.1-fast": {
    id: "veo:veo-3.1-fast",
    provider: "veo",
    label: "Veo 3.1 Fast",
    providerLabel: "Google",
    maxDurationSeconds: 8,
    imageInputs: VEO_REFS_IMAGE_INPUTS,
    params: veoParams,
    rules: VEO_REFS_RULES,
  },
  "veo:veo-3.1": {
    id: "veo:veo-3.1",
    provider: "veo",
    label: "Veo 3.1 Quality",
    providerLabel: "Google",
    maxDurationSeconds: 8,
    imageInputs: VEO_REFS_IMAGE_INPUTS,
    params: veoParams,
    rules: VEO_REFS_RULES,
  },
  "openai:sora-2": {
    id: "openai:sora-2",
    provider: "openai",
    label: "Sora 2",
    providerLabel: "OpenAI",
    maxDurationSeconds: 12,
    imageInputs: { startFrame: true, endFrame: false, maxReferenceImages: 0 },
    params: soraParams,
    rules: SORA_RULES,
  },
  "kling:kling-v1-5": {
    id: "kling:kling-v1-5",
    provider: "kling",
    label: "Kling 1.5",
    providerLabel: "Kling",
    maxDurationSeconds: 10,
    imageInputs: KLING_IMAGE_INPUTS,
    params: klingLegacyParams,
    rules: [],
  },
  "kling:kling-v1-6": {
    id: "kling:kling-v1-6",
    provider: "kling",
    label: "Kling 1.6",
    providerLabel: "Kling",
    maxDurationSeconds: 10,
    imageInputs: KLING_IMAGE_INPUTS,
    params: klingLegacyParams,
    rules: [],
  },
  "kling:kling-v2-1": {
    id: "kling:kling-v2-1",
    provider: "kling",
    label: "Kling 2.1",
    providerLabel: "Kling",
    maxDurationSeconds: 10,
    imageInputs: KLING_IMAGE_INPUTS,
    params: klingLegacyParams,
    rules: [],
  },
  "kling:kling-v2-1-master": {
    id: "kling:kling-v2-1-master",
    provider: "kling",
    label: "Kling 2.1 Master",
    providerLabel: "Kling",
    maxDurationSeconds: 10,
    imageInputs: KLING_IMAGE_INPUTS,
    params: klingLegacyParams,
    rules: [],
  },
  "kling:kling-v2-6": {
    id: "kling:kling-v2-6",
    provider: "kling",
    label: "Kling 2.6",
    providerLabel: "Kling",
    maxDurationSeconds: 10,
    imageInputs: KLING_IMAGE_INPUTS,
    params: klingLegacyParams,
    rules: [],
  },
  "kling:kling-v3": {
    id: "kling:kling-v3",
    provider: "kling",
    label: "Kling 3.0",
    providerLabel: "Kling",
    maxDurationSeconds: 15,
    imageInputs: KLING_IMAGE_INPUTS,
    params: klingV3Params,
    rules: [],
  },
};

export const DEFAULT_VIDEO_CLIENT_MODEL_ID = "veo:veo-3.1-lite";

export function defaultsForVideoModel(modelId: string): Record<string, unknown> {
  const spec = videoGenClientModelMap[modelId];
  if (!spec) return {};
  return Object.fromEntries(
    spec.params
      .filter((p) => p.defaultValue !== null && p.defaultValue !== undefined)
      .map((p) => [p.name, p.defaultValue]),
  );
}
