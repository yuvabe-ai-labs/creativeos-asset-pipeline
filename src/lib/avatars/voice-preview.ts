import type { GenerationRow } from "@/lib/db/types";
import { computeVideoCost } from "@/lib/video-gen/cost";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { GEMINI_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";
import {
  AVATAR_VOICE_PREVIEW_ASPECT, AVATAR_VOICE_PREVIEW_RESOLUTION, AVATAR_VOICE_PREVIEW_SECONDS,
  AVATAR_VOICE_PREVIEW_SLOT, AVATAR_VOICE_PREVIEW_TIMEOUT_MS,
} from "./constants";
import type { Avatar, VoicePreview } from "./schema";

// D294 — the voice preview: a short clip of the avatar's front image speaking one line, made by
// Gemini Omni and then re-voiced with the avatar's named voice. Pure rules, shared by the
// Studio, the route, the task and completeGeneration.

export const VOICE_PREVIEW_MODEL_ID = GEMINI_OMNI_MODEL_ID;

export function defaultVoicePreviewLine(name: string): string {
  const trimmed = name.trim();
  return trimmed ? `Hi, I'm ${trimmed}. This is how I sound.` : "Hi. This is how I sound.";
}

/** Omni's own prompt composer adds the no-on-screen-text and no-music clauses; this says what
 *  happens in the clip. The line is quoted, so a quote inside it must not close the quotation. */
export function buildVoicePreviewPrompt(line: string): string {
  const spoken = line.trim().replace(/"/g, "'");
  return (
    "The person in the image faces the camera and speaks directly to it in a natural, " +
    `conversational tone, saying exactly: "${spoken}" They say nothing else. ` +
    "Locked-off camera, the same framing as the image, natural blinking and small head movement. " +
    "One clear voice only: no music, no other voices."
  );
}

export function voicePreviewParams(): Record<string, unknown> {
  return {
    resolution: AVATAR_VOICE_PREVIEW_RESOLUTION,
    duration: AVATAR_VOICE_PREVIEW_SECONDS,
    aspect_ratio: AVATAR_VOICE_PREVIEW_ASPECT,
  };
}

/** The Omni clip plus the voice change over the same seconds. Null when Omni has no price at
 *  that resolution — no estimate, no preview. */
export function voicePreviewCostUsd(
  durationSeconds: number,
  resolution: string | undefined,
  priceMultiplier: number,
): number | null {
  const video = computeVideoCost(VOICE_PREVIEW_MODEL_ID, durationSeconds, false, resolution);
  if (!video) return null;
  return video.usd + computeVoiceChangeCost(durationSeconds, priceMultiplier).usd;
}

export function estimateVoicePreviewCredits(priceMultiplier = 1): number | null {
  const usd = voicePreviewCostUsd(AVATAR_VOICE_PREVIEW_SECONDS, AVATAR_VOICE_PREVIEW_RESOLUTION, priceMultiplier);
  return usd === null ? null : usdToFinalCredits(usd);
}

/** Why this avatar cannot have a preview made, or null when it can. */
export function voicePreviewBlocker(avatar: Pick<Avatar, "front" | "voice">): string | null {
  if (!avatar.front) return "Add a front image before generating a preview.";
  if (avatar.voice?.mode !== "named") return "Choose a named voice before generating a preview.";
  return null;
}

type PreviewInputs = {
  slot?: unknown; line?: unknown; voiceId?: unknown; voiceName?: unknown; frontUrl?: unknown;
};
const text = (value: unknown): string => (typeof value === "string" ? value : "");

export function isVoicePreviewGeneration(
  row: Pick<GenerationRow, "avatar_id" | "inputs_snapshot">,
): boolean {
  return Boolean(row.avatar_id) && (row.inputs_snapshot as PreviewInputs | null)?.slot === AVATAR_VOICE_PREVIEW_SLOT;
}

export function generationToVoicePreview(row: GenerationRow): VoicePreview | null {
  if (!isVoicePreviewGeneration(row)) return null;
  const inputs = (row.inputs_snapshot ?? {}) as PreviewInputs;
  return {
    generationId: row.id,
    status: row.status,
    url: row.status === "succeeded" ? row.output_snapshot : null,
    line: text(inputs.line),
    voiceId: text(inputs.voiceId),
    voiceName: text(inputs.voiceName),
    frontUrl: text(inputs.frontUrl),
    error: row.status === "failed" ? row.error : null,
    createdAt: row.created_at,
  };
}

export const VOICE_PREVIEW_TIMED_OUT_MESSAGE = "The preview took too long and was stopped. Nothing was charged.";

/** Still "running" long after the task must have ended: its task or its webhook was lost. */
export function isVoicePreviewAbandoned(
  row: Pick<GenerationRow, "status" | "created_at">,
  now: number = Date.now(),
): boolean {
  return row.status === "running" && now - new Date(row.created_at).getTime() > AVATAR_VOICE_PREVIEW_TIMEOUT_MS;
}

/** A preview shows one voice on one face; once either changes it no longer shows this avatar. */
export function isVoicePreviewStale(
  preview: Pick<VoicePreview, "voiceId" | "frontUrl">,
  avatar: Pick<Avatar, "front" | "voice">,
): boolean {
  const voiceId = avatar.voice?.mode === "named" ? avatar.voice.voiceId : null;
  return preview.voiceId !== voiceId || preview.frontUrl !== (avatar.front?.url ?? null);
}
