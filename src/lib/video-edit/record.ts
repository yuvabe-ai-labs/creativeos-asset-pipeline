// D483 — Video Gen's Edit mode. Client-safe: the focus view, History and the route all read this.
import { videoEstimateUsd } from "@/lib/ai-models/video-price";
import type { AiModelPrice, CreditSettings } from "@/lib/ai-models/types";
import { creditsFromUsd } from "@/lib/credits/units";
import { GEMINI_OMNI_11_MODEL_ID, GEMINI_OMNI_12_MODEL_ID, GEMINI_OMNI_MODEL_ID } from "@/lib/ai-models/model-ids";
import { modelPickerLabel, type VideoModels } from "@/lib/ai-models/model-lists";

export const VIDEO_EDIT_RESOLUTIONS = ["360p", "720p", "1080p", "4k"] as const;
export type VideoEditResolution = (typeof VIDEO_EDIT_RESOLUTIONS)[number];
export const VIDEO_EDIT_DEFAULT_RESOLUTION: VideoEditResolution = "720p";

const LINES: Record<VideoEditResolution, number> = { "360p": 360, "720p": 720, "1080p": 1080, "4k": 2160 };

/**
 * The resolution an edit starts at: the take's own, or the closest one an edit offers (a 480p
 * Seedance take edits at 360p, a 2k one at 1080p), so the edit comes back looking like the take.
 * 720p when the take recorded none.
 */
export function editResolutionForTake(takeResolution: unknown): VideoEditResolution {
  if (typeof takeResolution !== "string") return VIDEO_EDIT_DEFAULT_RESOLUTION;
  const r = takeResolution.trim().toLowerCase();
  if (VIDEO_EDIT_RESOLUTIONS.includes(r as VideoEditResolution)) return r as VideoEditResolution;
  const lines = r === "2k" ? 1440 : r.endsWith("k") ? Number(r.slice(0, -1)) * 540 : Number.parseInt(r, 10);
  if (!Number.isFinite(lines) || lines <= 0) return VIDEO_EDIT_DEFAULT_RESOLUTION;
  return VIDEO_EDIT_RESOLUTIONS.reduce((best, x) => (Math.abs(LINES[x] - lines) < Math.abs(LINES[best] - lines) ? x : best));
}

/** The models an edit can run on (D483/D484), newest first. */
export const VIDEO_EDIT_MODEL_IDS = [GEMINI_OMNI_12_MODEL_ID, GEMINI_OMNI_11_MODEL_ID] as const;
export type VideoEditModelId = (typeof VIDEO_EDIT_MODEL_IDS)[number];
export const VIDEO_EDIT_DEFAULT_MODEL_ID = GEMINI_OMNI_MODEL_ID as VideoEditModelId;

export function isVideoEditModelId(v: unknown): v is VideoEditModelId {
  return VIDEO_EDIT_MODEL_IDS.includes(v as VideoEditModelId);
}

/**
 * D540 — the model an edit of this take counts as its own (a hidden edit model keeps running
 * there): the model the take was last edited with, else the node's. The route and the panel
 * both read it, so they agree on what is offered.
 */
export function editOwnModelId(baseInputsUsed: unknown, nodeModelId: string | null): string | null {
  const inputs = baseInputsUsed && typeof baseInputsUsed === "object" ? (baseInputsUsed as { videoEdit?: unknown }) : null;
  return readVideoEdit(inputs?.videoEdit)?.modelId ?? nodeModelId;
}

/** D543 — the edit model to start on: the newest one offered on this take, else the default. */
export function firstOfferedEditModel(videos: VideoModels, ownModelId: string | null): VideoEditModelId {
  return VIDEO_EDIT_MODEL_IDS.find((id) => videos.isOffered(id, ownModelId)) ?? VIDEO_EDIT_DEFAULT_MODEL_ID;
}

/**
 * What a model allows for an edit, read off its catalog row so it can't drift from generation:
 * the longest take and the most references. Edits were tested on 3–6 s takes on 1.1.
 */
export function videoEditLimitsFor(videos: VideoModels, modelId: VideoEditModelId): { label: string; maxSeconds: number; maxReferences: number } {
  const spec = videos.specOrDefault(modelId);
  return {
    label: modelPickerLabel(spec),
    maxSeconds: spec.maxDurationSeconds,
    maxReferences: spec.imageInputs.maxReferenceImages,
  };
}

export function videoEditTooLongMessage(videos: VideoModels, modelId: VideoEditModelId): string {
  const { label, maxSeconds } = videoEditLimitsFor(videos, modelId);
  return `${label} edits takes up to ${maxSeconds} seconds.`;
}

export function videoEditTooManyReferencesMessage(videos: VideoModels, modelId: VideoEditModelId): string {
  const { label, maxReferences } = videoEditLimitsFor(videos, modelId);
  return `${label} takes up to ${maxReferences} references. Untick some.`;
}

export const VIDEO_EDIT_REFUSED_MESSAGE =
  "This edit can't be made. Takes with children, or changing one person into another, are refused.";
export const VIDEO_EDIT_FAILED_MESSAGE = "The edit didn't finish. Try again.";

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
  /** Absent until the operator picks one: the take's own (editResolutionForTake). */
  resolution?: VideoEditResolution;
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

/**
 * The one price both the panel's estimate and the route's reservation use. D528 — Omni also
 * bills the take itself as input (as many tokens as the output) and any reference images.
 * D534 — priced from the model's price row; null until it is known or when it has no price.
 */
export function videoEditEstimateCredits(
  price: AiModelPrice | null,
  durationSeconds: number,
  resolution: VideoEditResolution,
  referenceImages: number,
  settings: CreditSettings | null,
): number | null {
  if (!price) return null;
  const usd = videoEstimateUsd(price, {
    durationSeconds, audioEnabled: true, resolution, images: referenceImages, editInputSeconds: durationSeconds,
  });
  return usd === null || !settings ? null : creditsFromUsd(usd, settings);
}

export function videoEditGate(videos: VideoModels, a: {
  sourceId: string | null;
  instruction: string;
  durationSeconds: number;
  referenceCount: number;
  modelId: VideoEditModelId;
  running: boolean;
  locked: string | null;
  submitting: boolean;
}): { ok: true } | { ok: false; reason: string } {
  const limits = videoEditLimitsFor(videos, a.modelId);
  if (a.locked) return { ok: false, reason: a.locked };
  if (!a.sourceId) return { ok: false, reason: "Generate a take first." };
  if (a.running) return { ok: false, reason: "Wait for the current job to finish." };
  if (!a.instruction.trim()) return { ok: false, reason: "Describe the change first." };
  if (a.durationSeconds > limits.maxSeconds) return { ok: false, reason: videoEditTooLongMessage(videos, a.modelId) };
  if (a.referenceCount > limits.maxReferences) return { ok: false, reason: videoEditTooManyReferencesMessage(videos, a.modelId) };
  if (a.submitting) return { ok: false, reason: "Starting…" };
  return { ok: true };
}
