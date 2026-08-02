import type { VideoGenClientModelSpec, ConstraintRule } from "./types";
import { veoParams, veoLiteParams } from "./params/veo";
import { kling30Params, klingO1Params } from "./params/kling";

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

// D87: per-model, not shared — see providers/kling.ts for why. Client copies; this file cannot
// import the `server-only` provider module.
const KLING_30_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 0,
} as const;

// D88: the omni endpoint caps total images at 7 (references plus multi-image elements, with no
// reference video). Whether first_frame/last_frame count toward that 7 is not documented, so 5
// is the conservative figure that stays in budget with both frames in use. Being wrong this way
// costs two slots; being wrong the other way causes 400s.
const KLING_O1_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 5,
} as const;

// ── Kling constraint rules ────────────────────────────────────────────────────

// Both Kling endpoints require a first_frame. Previously this surfaced only as a throw inside
// the Trigger task — i.e. a generation that failed minutes after the click. As a rule it
// disables Generate up front instead.
//
// Lifting this for omni text-to-video needs an `aspect_ratio` param, which the omni docs make
// mandatory when no first frame and no reference video are present — deferred.
const KLING_REQUIRES_START_FRAME: ConstraintRule = {
  id: "kling-requires-start-frame",
  when: { field: "hasStartFrame", op: "eq", value: false },
  effect: { disableGenerate: true },
  reason: "Kling needs a start frame before you can generate",
};

const KLING_30_RULES: ConstraintRule[] = [
  KLING_REQUIRES_START_FRAME,
  {
    // Multi-shot cuts between shots; an end frame asks for one continuous interpolated path.
    // The two are contradictory, and Kling's API defaults multi_shot to true.
    id: "end-frame-disables-multi-shot",
    when: { field: "hasEndFrame", op: "eq", value: true },
    effect: { lockParams: [{ name: "multi_shot", value: false }] },
    reason: "End frame selected → multi-shot off (cuts break a single continuous shot)",
  },
];

// O1 exposes no multi_shot param, so it carries only the start-frame rule.
const KLING_O1_RULES: ConstraintRule[] = [KLING_REQUIRES_START_FRAME];

// ── Model map ─────────────────────────────────────────────────────────────────

export const videoGenClientModelMap: Record<string, VideoGenClientModelSpec> = {
  "veo:veo-3.1-lite": {
    id: "veo:veo-3.1-lite",
    provider: "veo",
    label: "Veo 3.1 Lite",
    providerLabel: "Veo",
    maxDurationSeconds: 8,
    imageInputs: VEO_LITE_IMAGE_INPUTS,
    params: veoLiteParams,
    rules: VEO_LITE_RULES,
  },
  "veo:veo-3.1-fast": {
    id: "veo:veo-3.1-fast",
    provider: "veo",
    label: "Veo 3.1 Fast",
    providerLabel: "Veo",
    maxDurationSeconds: 8,
    imageInputs: VEO_REFS_IMAGE_INPUTS,
    params: veoParams,
    rules: VEO_REFS_RULES,
  },
  "veo:veo-3.1": {
    id: "veo:veo-3.1",
    provider: "veo",
    label: "Veo 3.1 Quality",
    providerLabel: "Veo",
    maxDurationSeconds: 8,
    imageInputs: VEO_REFS_IMAGE_INPUTS,
    params: veoParams,
    rules: VEO_REFS_RULES,
  },
  "kling:kling-3-0": {
    id: "kling:kling-3-0",
    provider: "kling",
    label: "Kling 3.0",
    providerLabel: "Kling",
    maxDurationSeconds: 15,
    imageInputs: KLING_30_IMAGE_INPUTS,
    params: kling30Params,
    rules: KLING_30_RULES,
  },
  "kling:kling-o1": {
    id: "kling:kling-o1",
    provider: "kling",
    label: "Kling O1",
    providerLabel: "Kling",
    maxDurationSeconds: 10,
    imageInputs: KLING_O1_IMAGE_INPUTS,
    params: klingO1Params,
    rules: KLING_O1_RULES,
  },
};

// Models grouped by provider, preserving the map's declaration order.
export const videoGenClientModelGroups: Array<{
  label: string;
  models: VideoGenClientModelSpec[];
}> = (() => {
  const models = Object.values(videoGenClientModelMap);
  const order: string[] = [];
  for (const m of models) if (!order.includes(m.providerLabel)) order.push(m.providerLabel);
  return order.map((label) => ({
    label,
    models: models.filter((m) => m.providerLabel === label),
  }));
})();

/**
 * Label for the model picker, where the provider is ALREADY the group heading — "Veo 3.1 Fast"
 * sitting under a "Veo" header says Veo twice. Strips the provider prefix so the chips read
 * "3.1 Lite / 3.1 Fast / 3.1 Quality" and the eye compares only what differs.
 *
 * Derived from `label` rather than stored as a second field, so a renamed model cannot drift
 * from its picker text. `pickerLabel` stays available as an explicit override.
 */
export function modelPickerLabel(model: VideoGenClientModelSpec): string {
  if (model.pickerLabel) return model.pickerLabel;
  const prefix = `${model.providerLabel} `;
  return model.label.startsWith(prefix) ? model.label.slice(prefix.length) : model.label;
}

export const DEFAULT_VIDEO_CLIENT_MODEL_ID = "veo:veo-3.1-lite";

// Back-compat: map a removed/unknown model id (e.g. a persisted node still referencing a pruned
// model) to the default rather than crashing. Ported from the consolidation work during the
// 2026-07-26 integration; resolves against the union roster (Veo x3 + Sora 2 + Kling's 5 models).
export function resolveVideoModelId(modelId: string): string {
  return modelId in videoGenClientModelMap ? modelId : DEFAULT_VIDEO_CLIENT_MODEL_ID;
}

export function defaultsForVideoModel(modelId: string): Record<string, unknown> {
  const spec = videoGenClientModelMap[modelId];
  if (!spec) return {};
  return Object.fromEntries(
    spec.params
      .filter((p) => p.defaultValue !== null && p.defaultValue !== undefined)
      .map((p) => [p.name, p.defaultValue]),
  );
}
