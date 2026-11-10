// D483 — Video Gen's Edit mode. Client-safe: the focus view, History and the route all read this.
import { computeVideoCost } from "@/lib/video-gen/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import {
  GEMINI_OMNI_11_MODEL_ID,
  GEMINI_OMNI_12_MODEL_ID,
  GEMINI_OMNI_MODEL_ID,
  modelPickerLabel,
  videoGenClientModelMap,
} from "@/lib/video-gen/client-models";

export const VIDEO_EDIT_RESOLUTIONS = ["360p", "720p", "1080p", "4k"] as const;
export type VideoEditResolution = (typeof VIDEO_EDIT_RESOLUTIONS)[number];
export const VIDEO_EDIT_DEFAULT_RESOLUTION: VideoEditResolution = "720p";

/** The models an edit can run on (D483/D484), newest first. */
export const VIDEO_EDIT_MODEL_IDS = [GEMINI_OMNI_12_MODEL_ID, GEMINI_OMNI_11_MODEL_ID] as const;
export type VideoEditModelId = (typeof VIDEO_EDIT_MODEL_IDS)[number];
export const VIDEO_EDIT_DEFAULT_MODEL_ID = GEMINI_OMNI_MODEL_ID as VideoEditModelId;

export function isVideoEditModelId(v: unknown): v is VideoEditModelId {
  return VIDEO_EDIT_MODEL_IDS.includes(v as VideoEditModelId);
}

/**
 * What a model allows for an edit, read off its client spec so it can't drift from generation:
 * the longest take (1.2: 15 s, 1.1: 10 s) and the most references (1.2: 6, 1.1: 12). Edits were
 * tested on 3–6 s takes on 1.1; longer ones are untested.
 */
export function videoEditLimitsFor(modelId: VideoEditModelId): { label: string; maxSeconds: number; maxReferences: number } {
  const spec = videoGenClientModelMap[modelId];
  return {
    label: modelPickerLabel(spec),
    maxSeconds: spec.maxDurationSeconds,
    maxReferences: spec.imageInputs.maxReferenceImages,
  };
}

export function videoEditTooLongMessage(modelId: VideoEditModelId): string {
  const { label, maxSeconds } = videoEditLimitsFor(modelId);
  return `${label} edits takes up to ${maxSeconds} seconds.`;
}

export function videoEditTooManyReferencesMessage(modelId: VideoEditModelId): string {
  const { label, maxReferences } = videoEditLimitsFor(modelId);
  return `${label} takes up to ${maxReferences} references. Untick some.`;
}

export const VIDEO_EDIT_REFUSED_MESSAGE =
  "This edit can't be made. Takes with children, or changing one person into another, are refused.";
export const VIDEO_EDIT_FAILED_MESSAGE = "The edit didn't finish. Try again.";
export const VIDEO_EDIT_LIMITS_NOTE =
  "The edit keeps the take's length and shape. It works best on a single continuous shot. Captions on the video may change.";

/** What a person sees for a failed edit: the refusal as is, anything else in plain words. */
export function plainVideoEditFailure(raw: string): string {
  return raw === VIDEO_EDIT_REFUSED_MESSAGE ? VIDEO_EDIT_REFUSED_MESSAGE : VIDEO_EDIT_FAILED_MESSAGE;
}

/** Stored on `generations.inputs_snapshot.videoEdit`, carried onto the version's `inputs_used`. */
export type VideoEditRecord = {
  baseVersionId: string;
  rootVersionId: string;
  instruction: string;
  editPrompt: string;
  referenceNodeIds: string[];
  referenceUrls: string[];
  resolution: VideoEditResolution;
  /** Absent on edits made before the model choice (D484); those ran on Omni 1.1. */
  modelId?: VideoEditModelId;
};

/** The panel's last choice, kept on the node (`nodes.data.videoEdit`). null ids = use the take's own. */
export type VideoEditNodeState = {
  instruction: string;
  referenceNodeIds: string[] | null;
  resolution: VideoEditResolution;
  /** Absent until the operator picks one: the default model. */
  modelId?: VideoEditModelId;
};

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

export function readVideoEdit(value: unknown): VideoEditRecord | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== "object") return null;
  const keys = ["baseVersionId", "rootVersionId", "instruction", "editPrompt"] as const;
  if (!keys.every((k) => typeof v[k] === "string")) return null;
  if (!isStrings(v.referenceNodeIds) || !isStrings(v.referenceUrls)) return null;
  if (!VIDEO_EDIT_RESOLUTIONS.includes(v.resolution as VideoEditResolution)) return null;
  return {
    baseVersionId: v.baseVersionId as string,
    rootVersionId: v.rootVersionId as string,
    instruction: v.instruction as string,
    editPrompt: v.editPrompt as string,
    referenceNodeIds: v.referenceNodeIds,
    referenceUrls: v.referenceUrls,
    resolution: v.resolution as VideoEditResolution,
    ...(isVideoEditModelId(v.modelId) ? { modelId: v.modelId } : {}),
  };
}

/** The one price both the panel's estimate and the route's reservation use. */
export function videoEditEstimateCredits(durationSeconds: number, resolution: VideoEditResolution, modelId: VideoEditModelId): number {
  const cost = computeVideoCost(modelId, durationSeconds, true, resolution);
  return cost ? usdToFinalCredits(cost.usd) : 0;
}

export function videoEditGate(a: {
  sourceId: string | null;
  instruction: string;
  durationSeconds: number;
  referenceCount: number;
  modelId: VideoEditModelId;
  running: boolean;
  locked: string | null;
  submitting: boolean;
}): { ok: true } | { ok: false; reason: string } {
  const limits = videoEditLimitsFor(a.modelId);
  if (a.locked) return { ok: false, reason: a.locked };
  if (!a.sourceId) return { ok: false, reason: "Generate a take first." };
  if (a.running) return { ok: false, reason: "Wait for the current job to finish." };
  if (!a.instruction.trim()) return { ok: false, reason: "Describe the change first." };
  if (a.durationSeconds > limits.maxSeconds) return { ok: false, reason: videoEditTooLongMessage(a.modelId) };
  if (a.referenceCount > limits.maxReferences) return { ok: false, reason: videoEditTooManyReferencesMessage(a.modelId) };
  if (a.submitting) return { ok: false, reason: "Starting…" };
  return { ok: true };
}
