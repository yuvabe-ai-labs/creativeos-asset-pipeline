import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import type { AvatarVoice, AvatarVoiceMode, PersonType } from "./schema";

// D293 — the avatar declares one voice; every generation realises it. Pure rules, shared by the
// Studio and the voice route.

/** Which declarations an avatar may make. Any face can have a voice chosen for it (D301): the
 *  engine that makes it follows the face (Seedance on a Seedream face, Gemini Omni otherwise), and
 *  it is kept as an auto voice for every model. Nothing before there is a face. */
export function allowedVoiceModes(personType: PersonType | null): AvatarVoiceMode[] {
  return personType ? ["native", "named"] : [];
}

export function isVoiceAllowed(voice: AvatarVoice, personType: PersonType | null): boolean {
  return allowedVoiceModes(personType).includes(voice.mode);
}

/** Every voice survives a front change now (D301); the preview goes stale instead, and the next
 *  one uses the new face's engine. Kept as the one place a front change decides the voice. */
export function voiceAfterFrontChange(
  voice: AvatarVoice | null,
  nextPersonType: PersonType,
): AvatarVoice | null {
  if (!voice) return null;
  return isVoiceAllowed(voice, nextPersonType) ? voice : null;
}

export function avatarVoiceLabel(voice: AvatarVoice | null): string | null {
  if (!voice) return null;
  return voice.mode === "native" ? "Chosen for me" : voice.name;
}

/** The avatar's named voice in the shape the voice picker's field shows. Null for a native
 *  voice or none. The snapshot carries no category or price, which the field does not need. */
export function avatarVoiceToPickerVoice(voice: AvatarVoice | null): PickerVoice | null {
  if (!voice || voice.mode !== "named") return null;
  return {
    voiceId: voice.voiceId,
    source: "account",
    name: voice.name,
    description: null,
    previewUrl: voice.previewUrl,
    labels: voice.labels,
    category: "",
    priceMultiplier: 1,
  };
}

/** The snapshot stored on the avatar: enough to show the voice and to re-voice with it. */
export function pickerVoiceToAvatarVoice(voice: PickerVoice, origin?: "library" | "custom"): AvatarVoice {
  return {
    mode: "named",
    voiceId: voice.voiceId,
    name: voice.name,
    labels: { ...voice.labels },
    previewUrl: voice.previewUrl,
    ...(origin ? { origin } : {}),
  };
}
