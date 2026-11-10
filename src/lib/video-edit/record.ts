// D483 — Video Gen's Edit mode. Client-safe: the focus view, History and the route all read this.
import { computeVideoCost } from "@/lib/video-gen/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { GEMINI_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";

export const VIDEO_EDIT_RESOLUTIONS = ["360p", "720p", "1080p", "4k"] as const;
export type VideoEditResolution = (typeof VIDEO_EDIT_RESOLUTIONS)[number];
export const VIDEO_EDIT_DEFAULT_RESOLUTION: VideoEditResolution = "720p";

/** Omni's generation maximum. Edits were tested on 3–6 s takes; longer ones are untested. */
export const VIDEO_EDIT_MAX_SECONDS = 10;

export const VIDEO_EDIT_REFUSED_MESSAGE =
  "This edit can't be made. Takes with children, or changing one person into another, are refused.";
export const VIDEO_EDIT_LIMITS_NOTE =
  "The edit keeps the take's length and shape. It works best on a single continuous shot. Captions on the video may change.";

/** Stored on `generations.inputs_snapshot.videoEdit`, carried onto the version's `inputs_used`. */
export type VideoEditRecord = {
  baseVersionId: string;
  rootVersionId: string;
  instruction: string;
  editPrompt: string;
  referenceNodeIds: string[];
  referenceUrls: string[];
  resolution: VideoEditResolution;
};

/** The panel's last choice, kept on the node (`nodes.data.videoEdit`). null ids = use the take's own. */
export type VideoEditNodeState = {
  instruction: string;
  referenceNodeIds: string[] | null;
  resolution: VideoEditResolution;
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
  };
}

/** The one price both the panel's estimate and the route's reservation use. */
export function videoEditEstimateCredits(durationSeconds: number, resolution: VideoEditResolution): number {
  const cost = computeVideoCost(GEMINI_OMNI_MODEL_ID, durationSeconds, true, resolution);
  return cost ? usdToFinalCredits(cost.usd) : 0;
}

export function videoEditGate(a: {
  sourceId: string | null;
  instruction: string;
  durationSeconds: number;
  running: boolean;
  locked: string | null;
  submitting: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (a.locked) return { ok: false, reason: a.locked };
  if (!a.sourceId) return { ok: false, reason: "Generate a take first." };
  if (a.running) return { ok: false, reason: "Wait for the current job to finish." };
  if (!a.instruction.trim()) return { ok: false, reason: "Describe the change first." };
  if (a.durationSeconds > VIDEO_EDIT_MAX_SECONDS) return { ok: false, reason: "Edits work on takes up to 10 seconds." };
  if (a.submitting) return { ok: false, reason: "Starting…" };
  return { ok: true };
}
