import type { ParamSpec } from "@/lib/image-gen/types";
import type { VideoProviderUsage } from "./provider-usage";

export type { ParamSpec };

export type ImageInputCapabilities = {
  startFrame: boolean;
  endFrame: boolean;
  maxReferenceImages: number; // 0 = none supported
  /** Total images (frames + references) the model renders faithfully once a frame is set; the
   *  reference cap shrinks to fit. Unset = frames don't affect the reference cap (D428). */
  maxImagesWithFrames?: number;
};

export type VideoGenInput = {
  prompt: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
  referenceUrls: string[];
  /**
   * D296 — an audio clip whose VOICE the model should reuse. Seedance 2.5 only: it invents a
   * fresh voice for every clip, so this is what keeps one avatar sounding the same across a
   * reel (an avatar's stored voice sample). Every other provider ignores it — Gemini Omni and
   * Veo accept no audio input at all.
   */
  referenceAudioUrl?: string;
  /**
   * D483 — edit this stored take instead of generating. Gemini Omni only; the output has the
   * take's length and shape, and `params.durationSeconds` carries that length for costing.
   */
  editVideoUrl?: string;
  params: Record<string, unknown>;
};

export type VideoGenResult = {
  videoUrl: string;
  durationSeconds: number;
  /** D551 — what the provider says it billed, when it says (Gemini Omni, Seedance). */
  usage?: VideoProviderUsage;
};

// ── Constraint rule system (JSON-serializable, DB-ready) ──────────────────────

/** `duration` reads `params.duration` as a number (stored as a number or a numeric string). */
export type ConditionField = "referenceCount" | "hasEndFrame" | "hasStartFrame" | "duration";
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
  provider: "veo" | "openai" | "kling" | "gemini" | "seedance";
  label: string;
  /** Short label for the compact model-picker chip; falls back to `label` when unset. */
  pickerLabel?: string;
  providerLabel: string;
  maxDurationSeconds: number;
  imageInputs: ImageInputCapabilities;
  params: ParamSpec[];
  rules?: ConstraintRule[];
};

export type VideoGenClientModelSpec = VideoGenModelSpec;

/** D561 — what an adapter is given besides the request: the catalog's spec and the provider's
 *  own name for the model (the row's provider_model_id). */
export type VideoAdapterContext = { spec: VideoGenClientModelSpec; providerModelId: string };
export type VideoAdapter = (input: VideoGenInput, ctx: VideoAdapterContext) => Promise<VideoGenResult>;
