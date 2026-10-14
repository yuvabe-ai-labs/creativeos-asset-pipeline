// D292 — voices scoped to a client. One ElevenLabs account serves every client, so which voices
// a client may see and use is decided here, from our own `client_voices` record. Pure: shared by
// the routes and their tests.
import { CUSTOM_VOICE_CATEGORIES } from "./constants";
import type { PickerVoice } from "./voice-catalog";

/** A stock ElevenLabs voice is on every account and uses no voice slot: open to every client. */
function isStockVoice(voice: PickerVoice): boolean {
  return !CUSTOM_VOICE_CATEGORIES.has(voice.category);
}

/** May this client use this account voice? Its own (cloned or saved from the Library for it),
 *  or a stock voice — never a voice recorded for another client. */
export function isVoiceAvailableToClient(voice: PickerVoice, clientVoiceIds: string[]): boolean {
  return isStockVoice(voice) || clientVoiceIds.includes(voice.voiceId);
}

/** The picker's "This client" list, in the account's own order. */
export function clientPickerVoices(accountVoices: PickerVoice[], clientVoiceIds: string[]): PickerVoice[] {
  return accountVoices.filter((v) => isVoiceAvailableToClient(v, clientVoiceIds));
}

// ── Cloning ───────────────────────────────────────────────────────────────────

export const VOICE_CLONE_EXTENSIONS = new Set(["mp3", "wav", "m4a"]);
export const VOICE_CLONE_ACCEPT = "audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a";
export const VOICE_CLONE_MAX_FILES = 10;
// The clone request passes through a serverless function, whose body is capped at 4.5 MB. An
// mp3 of one to two minutes — what ElevenLabs recommends — is well inside this.
export const VOICE_CLONE_MAX_TOTAL_BYTES = 4 * 1024 * 1024;
export const VOICE_CLONE_MAX_LABEL = "4 MB";
export const VOICE_NAME_MAX = 60;
export const VOICE_CLONE_CONSENT_STATEMENT = "I have the speaker's permission to clone this voice";

/** Browser and server share this, so the message is the same before and after the request. */
export function validateVoiceCloneInput(input: {
  name: string;
  consent: boolean;
  files: { name: string; size: number }[];
}): string | null {
  const name = input.name.trim();
  if (!name) return "Give the voice a name.";
  if (name.length > VOICE_NAME_MAX) return `The name can be at most ${VOICE_NAME_MAX} characters.`;
  if (input.files.length === 0) return "Add at least one audio file of the speaker.";
  if (input.files.length > VOICE_CLONE_MAX_FILES) {
    return `Add at most ${VOICE_CLONE_MAX_FILES} audio files.`;
  }
  for (const file of input.files) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!VOICE_CLONE_EXTENSIONS.has(ext)) {
      return `Unsupported audio type '.${ext}'. Allowed: ${[...VOICE_CLONE_EXTENSIONS].join(", ")}.`;
    }
  }
  const total = input.files.reduce((sum, f) => sum + f.size, 0);
  if (total > VOICE_CLONE_MAX_TOTAL_BYTES) {
    return `The audio is larger than the ${VOICE_CLONE_MAX_LABEL} limit. A one to two minute mp3 works best.`;
  }
  if (!input.consent) return "Confirm that you have the speaker's permission to clone this voice.";
  return null;
}
