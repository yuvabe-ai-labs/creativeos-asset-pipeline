import type { VideoGenClientModelSpec, ConstraintRule } from "./types";
import { veoParams, veoLiteParams } from "./params/veo";
import { soraParams } from "./params/sora";

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
    reason: "End frame requires 8s duration",
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
    reason: "End frame requires a start frame",
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
    reason: "Reference images require 8s and can't be combined with start/end frame",
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
    reason: "Start/end frame can't be combined with reference images",
  },
  {
    id: "end-frame-lock-duration",
    when: { field: "hasEndFrame", op: "eq", value: true },
    effect: { lockParams: [{ name: "duration", value: "8" }] },
    reason: "End frame requires 8s duration",
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
    reason: "End frame requires a start frame",
  },
];

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
  },
};

export const DEFAULT_VIDEO_CLIENT_MODEL_ID = "veo:veo-3.1-fast";

export function defaultsForVideoModel(modelId: string): Record<string, unknown> {
  const spec = videoGenClientModelMap[modelId];
  if (!spec) return {};
  return Object.fromEntries(
    spec.params
      .filter((p) => p.defaultValue !== null && p.defaultValue !== undefined)
      .map((p) => [p.name, p.defaultValue]),
  );
}
