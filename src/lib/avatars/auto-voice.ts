import "server-only";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { cloneVoice, deleteVoice } from "@/lib/elevenlabs/voice-catalog";
import { invalidateAccountVoices } from "@/lib/elevenlabs/voices-cache";
import type { Avatar, AvatarVoice, AvatarVoiceSample } from "./schema";

// D301 — "Choose a voice for me" keeps the voice its preview invented. The voice sample is what
// Seedance is given; only Seedance takes audio, so the same sample is also cloned into an
// ElevenLabs voice — the auto voice — which Edit voice offers on Gemini Omni, Kling and Veo. One per
// avatar: a new preview's clone replaces the last. It is not a client voice (`client_voices`), so it
// never shows in the library picker; it belongs to the avatar's declaration.

export type AutoVoiceDeps = {
  fetchBytes: (url: string) => Promise<ArrayBuffer>;
  cloneVoice: typeof cloneVoice;
  deleteVoice: (voiceId: string) => Promise<void>;
  getAvatar: (clientId: string, avatarId: string) => Promise<Avatar | null>;
  updateAvatar: (clientId: string, avatarId: string, patch: { voice: AvatarVoice }) => Promise<unknown>;
  invalidate: (voiceId: string) => void;
};

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download the voice sample (${res.status})`);
  return res.arrayBuffer();
}

const DEFAULT_DEPS: AutoVoiceDeps = {
  fetchBytes,
  cloneVoice: (args) => cloneVoice(args),
  deleteVoice: (voiceId) => deleteVoice(voiceId),
  getAvatar,
  updateAvatar: (clientId, avatarId, patch) => updateAvatar(clientId, avatarId, patch),
  invalidate: invalidateAccountVoices,
};

/** "{client} · {avatar} (auto)" — traceable on the shared ElevenLabs account, like D292's clones. */
export function autoVoiceName(clientName: string, avatarName: string): string {
  return `${clientName} · ${avatarName.trim() || "Avatar"} (auto)`;
}

function logFailure(message: string, avatarId: string, e: unknown) {
  console.error(`[keepAutoVoice] ${message}`, { avatarId, error: e instanceof Error ? e.message : String(e) });
}

/**
 * Clones a native preview's voice sample into the avatar's auto voice and records it, removing
 * the one an earlier preview made. Returns the new voice id, or null when there is nothing to do
 * or it could not be made — never throwing, so the preview it follows still lands.
 */
export async function keepAutoVoice(
  args: { clientId: string; clientName: string; avatarId: string; sample: AvatarVoiceSample },
  deps: AutoVoiceDeps = DEFAULT_DEPS,
): Promise<string | null> {
  const { clientId, clientName, avatarId, sample } = args;
  const before = await deps.getAvatar(clientId, avatarId).catch(() => null);
  if (before?.voice?.mode !== "native") return null;

  let voiceId: string;
  try {
    const bytes = await deps.fetchBytes(sample.url);
    voiceId = await deps.cloneVoice({
      name: autoVoiceName(clientName, before.name),
      // The sample is already a clean, extracted voice track.
      removeBackgroundNoise: false,
      files: [{ name: "voice.mp3", type: "audio/mpeg", bytes }],
    });
  } catch (e) {
    logFailure("could not clone the voice", avatarId, e);
    return null;
  }

  try {
    // Read again: the operator may have changed the voice while the clone was being made.
    const now = await deps.getAvatar(clientId, avatarId);
    if (now?.voice?.mode !== "native") {
      await deps.deleteVoice(voiceId).catch((e) => logFailure("could not remove an unused clone", avatarId, e));
      return null;
    }
    const previous = now.voice.autoVoice?.voiceId;
    await deps.updateAvatar(clientId, avatarId, {
      voice: { mode: "native", autoVoice: { voiceId, sourceKey: sample.sourceKey } },
    });
    deps.invalidate(voiceId);
    if (previous && previous !== voiceId) {
      await deps.deleteVoice(previous).catch((e) => logFailure("could not remove the previous auto voice", avatarId, e));
    }
    return voiceId;
  } catch (e) {
    logFailure("could not record the auto voice", avatarId, e);
    return null;
  }
}
