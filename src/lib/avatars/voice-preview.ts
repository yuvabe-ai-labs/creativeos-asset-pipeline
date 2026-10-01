import type { GenerationRow } from "@/lib/db/types";
import { computeVideoCost } from "@/lib/video-gen/cost";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { GEMINI_OMNI_MODEL_ID, SEEDANCE_MODEL_ID } from "@/lib/video-gen/client-models";
import {
  AVATAR_VOICE_PREVIEW_ASPECT, AVATAR_VOICE_PREVIEW_RESOLUTION, AVATAR_VOICE_PREVIEW_SECONDS,
  AVATAR_VOICE_PREVIEW_SLOT, AVATAR_VOICE_PREVIEW_TIMEOUT_MS,
  AVATAR_VOICE_SAMPLE_RESOLUTION, AVATAR_VOICE_SAMPLE_SECONDS,
} from "./constants";
import type { Avatar, VoicePreview } from "./schema";

// D294, D296 — the voice preview: a short clip of the avatar's front image speaking one line.
// The declaration decides the engine, so there are two modes:
//
//   named  — Gemini Omni animates the front image, then the clip is re-voiced with the avatar's
//            ElevenLabs voice (D284's steps). The clip is what you get.
//   native — Seedance generates the clip AND invents the voice, and that voice is extracted and
//            kept as the avatar's reference audio (§6.7), so every later generation sounds the
//            same. Generated avatars only: Seedance refuses a real face.
//
// Pure rules, shared by the Studio, the route, the task and completeGeneration.

export type VoicePreviewMode = "named" | "native";

export const VOICE_PREVIEW_ENGINE: Record<
  VoicePreviewMode,
  { modelId: string; resolution: string; seconds: number }
> = {
  named: {
    modelId: GEMINI_OMNI_MODEL_ID,
    resolution: AVATAR_VOICE_PREVIEW_RESOLUTION,
    seconds: AVATAR_VOICE_PREVIEW_SECONDS,
  },
  native: {
    modelId: SEEDANCE_MODEL_ID,
    resolution: AVATAR_VOICE_SAMPLE_RESOLUTION,
    seconds: AVATAR_VOICE_SAMPLE_SECONDS,
  },
};

/** Which preview this avatar's declaration asks for, or null when it has declared nothing —
 *  the declaration is what picks the engine, so with none there is nothing to preview. */
export function voicePreviewMode(avatar: Pick<Avatar, "voice">): VoicePreviewMode | null {
  return avatar.voice?.mode ?? null;
}

/** The declaration as a cache key: its mode and, for a named voice, which one. The preview's
 *  estimate depends on both, so the Studio and the canvas key the preview query by it. */
export function voiceDeclarationKey(voice: Avatar["voice"]): string | null {
  if (!voice) return null;
  return `${voice.mode}:${voice.mode === "named" ? voice.voiceId : ""}`;
}

/** True for the mode whose clip's own voice is kept as the avatar's reference audio. */
export function voicePreviewKeepsSample(mode: VoicePreviewMode): boolean {
  return mode === "native";
}

export function defaultVoicePreviewLine(name: string): string {
  const trimmed = name.trim();
  return trimmed ? `Hi, I'm ${trimmed}. This is how I sound.` : "Hi. This is how I sound.";
}

/** Each engine's own prompt. The line is quoted, so a quote inside it must not close the
 *  quotation. Omni's composer adds its own no-on-screen-text and no-music clauses; Seedance has
 *  no composer, so this says the whole thing. */
export function buildVoicePreviewPrompt(line: string, mode: VoicePreviewMode): string {
  const spoken = line.trim().replace(/"/g, "'");
  const shared =
    "The person in the image faces the camera and speaks directly to it in a natural, " +
    `conversational tone, saying exactly: "${spoken}" They say nothing else. ` +
    "Locked-off camera, the same framing as the image, natural blinking and small head movement. " +
    "One clear voice only: no music, no other voices.";
  if (mode === "named") return shared;
  // Seedance invents the voice with the clip, and that voice becomes this avatar's reference —
  // so it is worth asking for one that suits the person and is free of anything that would ride
  // along into every later generation.
  return (
    `${shared} The voice is theirs: clear, unhurried, and suited to their age and appearance. ` +
    "No background music, no sound effects, no reverb. No on-screen text."
  );
}

/** The params each engine takes. Omni's ratio field is `aspect_ratio`; Seedance's is `ratio`,
 *  and neither accepts the other's — a wrong key is a 400 on a request we would have paid for. */
export function voicePreviewParams(mode: VoicePreviewMode): Record<string, unknown> {
  const engine = VOICE_PREVIEW_ENGINE[mode];
  const base = { resolution: engine.resolution, duration: engine.seconds };
  return mode === "named"
    ? { ...base, aspect_ratio: AVATAR_VOICE_PREVIEW_ASPECT }
    : { ...base, ratio: AVATAR_VOICE_PREVIEW_ASPECT };
}

/** What a preview costs. A named preview pays for the clip and the voice change over the same
 *  seconds; a native one pays for the clip alone, because Seedance's voice arrives with it.
 *  Null when the engine has no price at that resolution — no estimate, no preview. */
export function voicePreviewCostUsd(
  mode: VoicePreviewMode,
  durationSeconds: number,
  resolution: string | undefined,
  priceMultiplier: number,
): number | null {
  const video = computeVideoCost(VOICE_PREVIEW_ENGINE[mode].modelId, durationSeconds, false, resolution);
  if (!video) return null;
  if (mode === "native") return video.usd;
  return video.usd + computeVoiceChangeCost(durationSeconds, priceMultiplier).usd;
}

export function estimateVoicePreviewCredits(
  mode: VoicePreviewMode,
  priceMultiplier = 1,
): number | null {
  const engine = VOICE_PREVIEW_ENGINE[mode];
  const usd = voicePreviewCostUsd(mode, engine.seconds, engine.resolution, priceMultiplier);
  return usd === null ? null : usdToFinalCredits(usd);
}

/** Why this avatar cannot have a preview made, or null when it can. */
export function voicePreviewBlocker(avatar: Pick<Avatar, "front" | "voice">): string | null {
  if (!avatar.front) return "Add a front image before generating a preview.";
  if (!voicePreviewMode(avatar)) return "Choose a voice before generating a preview.";
  return null;
}

type PreviewInputs = {
  slot?: unknown; mode?: unknown; line?: unknown; voiceId?: unknown; voiceName?: unknown;
  frontUrl?: unknown;
};
const text = (value: unknown): string => (typeof value === "string" ? value : "");

export function isVoicePreviewGeneration(
  row: Pick<GenerationRow, "avatar_id" | "inputs_snapshot">,
): boolean {
  return Boolean(row.avatar_id) && (row.inputs_snapshot as PreviewInputs | null)?.slot === AVATAR_VOICE_PREVIEW_SLOT;
}

/** The mode a stored preview was made in. Rows written before D296 carry no mode and are all
 *  named previews, which is the fallback. */
export function voicePreviewRowMode(
  row: Pick<GenerationRow, "inputs_snapshot">,
): VoicePreviewMode {
  return (row.inputs_snapshot as PreviewInputs | null)?.mode === "native" ? "native" : "named";
}

export function generationToVoicePreview(row: GenerationRow): VoicePreview | null {
  if (!isVoicePreviewGeneration(row)) return null;
  const inputs = (row.inputs_snapshot ?? {}) as PreviewInputs;
  const mode = voicePreviewRowMode(row);
  return {
    generationId: row.id,
    mode,
    status: row.status,
    url: row.status === "succeeded" ? row.output_snapshot : null,
    line: text(inputs.line),
    // Seedance's voice has no id — it exists only in the clip, and in the sample extracted
    // from it.
    voiceId: mode === "named" ? text(inputs.voiceId) : null,
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

/** A preview shows one voice on one face; once either changes it no longer shows this avatar.
 *  The mode is part of that: a Seedance clip is not a preview of a named voice. */
export function isVoicePreviewStale(
  preview: Pick<VoicePreview, "mode" | "voiceId" | "frontUrl">,
  avatar: Pick<Avatar, "front" | "voice">,
): boolean {
  const mode = voicePreviewMode(avatar);
  if (preview.mode !== mode) return true;
  const voiceId = avatar.voice?.mode === "named" ? avatar.voice.voiceId : null;
  return preview.voiceId !== voiceId || preview.frontUrl !== (avatar.front?.url ?? null);
}
