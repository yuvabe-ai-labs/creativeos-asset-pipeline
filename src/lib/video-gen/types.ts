import type { ParamSpec } from "@/lib/image-gen/types";

export type { ParamSpec };

export type ImageInputCapabilities = {
  startFrame: boolean;
  endFrame: boolean;
  maxReferenceImages: number; // 0 = none supported
};

export type VideoGenInput = {
  prompt: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
  referenceUrls: string[];
  params: Record<string, unknown>;
};

export type VideoGenResult = {
  videoUrl: string;
  durationSeconds: number;
  providerJobId?: string;
};

// ── Constraint rule system (JSON-serializable, DB-ready) ──────────────────────

export type ConditionField = "referenceCount" | "hasEndFrame" | "hasStartFrame";
export type ConditionOp = "gt" | "gte" | "eq";

export type LeafCondition = {
  field: ConditionField;
  op: ConditionOp;
  value: number | boolean;
};

export type CompoundCondition = {
  op: "and" | "or";
  conditions: Condition[];
};

export type Condition = LeafCondition | CompoundCondition;

export type ConstraintEffect = {
  lockParams?: Array<{ name: string; value: unknown }>;
  disableFrameInputs?: boolean;
  disableRefs?: boolean;
  disableGenerate?: boolean;
};

export type ConstraintRule = {
  id: string;
  when: Condition;
  effect: ConstraintEffect;
  reason: string;
};

export type ConstraintState = {
  params: Record<string, unknown>;
  hasStartFrame: boolean;
  hasEndFrame: boolean;
  referenceCount: number;
};

export type EvaluatedConstraints = {
  lockedParams: Record<string, unknown>;
  lockedParamReasons: Record<string, string>;
  disableFrameInputs: boolean;
  disableFrameInputsReason?: string;
  disableRefs: boolean;
  disableRefsReason?: string;
  disableGenerate: boolean;
  disableGenerateReason?: string;
};

// ── Model specs ───────────────────────────────────────────────────────────────

export type VideoGenModelSpec = {
  id: string;
  provider: "veo" | "openai" | "kling";
  label: string;
  /** Short label for the compact model-picker chip; falls back to `label` when unset. */
  pickerLabel?: string;
  providerLabel: string;
  maxDurationSeconds: number;
  imageInputs: ImageInputCapabilities;
  params: ParamSpec[];
  rules?: ConstraintRule[];
  generate: (input: VideoGenInput) => Promise<VideoGenResult>;
};

export type VideoGenClientModelSpec = Omit<VideoGenModelSpec, "generate">;
