import "server-only";
import { textToSpeech } from "@/lib/elevenlabs/client";
import { uploadAvatarNamedVoiceSample } from "@/lib/storage";
import { updateAvatar } from "@/lib/db/avatars";
import { mp3DurationSeconds } from "@/lib/media/mp3";
import { VOICE_MAX_SECONDS, VOICE_MIN_SECONDS } from "@/lib/ugc/constants";
import { avatarWorksWith } from "./generation";
import { matchingVoiceReference, namedVoiceSampleKey } from "./presenter";
import type { Avatar, AvatarVoiceSample } from "./schema";

export type VoiceReferenceDeps = {
  fetchBytes: (url: string) => Promise<Buffer>;
  textToSpeech: (args: { voiceId: string; text: string }) => Promise<Buffer>;
  upload: (args: { clientId: string; avatarId: string; voiceId: string; body: Buffer }) => Promise<{ url: string }>;
  save: (clientId: string, avatarId: string, sample: AvatarVoiceSample) => Promise<unknown>;
};

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download the voice sample (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

const DEFAULT_DEPS: VoiceReferenceDeps = {
  fetchBytes,
  textToSpeech: (args) => textToSpeech(args),
  upload: uploadAvatarNamedVoiceSample,
  save: (clientId, avatarId, voiceSample) => updateAvatar(clientId, avatarId, { voiceSample }),
};

/** The line a voice reads when it has no sample of its own — about ten seconds. */
export function voiceReferenceLine(name: string): string {
  const who = name.trim() ? `Hi, I'm ${name.trim()}.` : "Hi.";
  return `${who} This is how I sound when I talk about the things I care about.`;
}

/**
 * D299 — the audio Seedance is given for an avatar's named voice: the ElevenLabs voice's own
 * sample, copied into our bucket, or — when it has none, as cloned voices often do — one short
 * line read by text-to-speech. Stored as the avatar's voice sample, keyed to that voice.
 *
 * Only for avatars that can run on Seedance (a Seedream face): nothing else takes audio. Returns
 * the sample already made for this voice without redoing it, and null — never throwing — when
 * there is nothing to make or it could not be made, so a caller's declaration always stands.
 */
export async function prepareNamedVoiceReference(
  clientId: string,
  avatar: Avatar,
  deps: VoiceReferenceDeps = DEFAULT_DEPS,
): Promise<AvatarVoiceSample | null> {
  const voice = avatar.voice;
  if (voice?.mode !== "named" || !avatarWorksWith(avatar).includes("Seedance")) return null;
  const existing = matchingVoiceReference(avatar);
  if (existing) return existing;

  try {
    let bytes = voice.previewUrl ? await deps.fetchBytes(voice.previewUrl).catch(() => null) : null;
    // A preview too short to be a reference is no better than none.
    if (bytes && mp3DurationSeconds(bytes) < VOICE_MIN_SECONDS) bytes = null;
    bytes ??= await deps.textToSpeech({ voiceId: voice.voiceId, text: voiceReferenceLine(avatar.name) });

    const seconds = Math.min(mp3DurationSeconds(bytes), VOICE_MAX_SECONDS);
    if (seconds < VOICE_MIN_SECONDS) return null;
    const { url } = await deps.upload({ clientId, avatarId: avatar.id, voiceId: voice.voiceId, body: bytes });
    const sample: AvatarVoiceSample = {
      url,
      durationSeconds: Math.round(seconds * 10) / 10,
      sourceKey: namedVoiceSampleKey(voice.voiceId),
    };
    await deps.save(clientId, avatar.id, sample);
    return sample;
  } catch (e) {
    console.error("[prepareNamedVoiceReference] could not make the voice reference", {
      avatarId: avatar.id,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
