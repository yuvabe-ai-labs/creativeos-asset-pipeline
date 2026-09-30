import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import type { AvatarVoice, AvatarVoiceMode, PersonType } from "./schema";

// D293 — the avatar declares one voice; every generation realises it. Pure rules, shared by the
// Studio and the voice route.

/** Which declarations an avatar of this kind may make. A generated avatar runs on Seedance,
 *  which speaks with its own voice or can be re-voiced; a real person runs on Gemini Omni,
 *  which takes no audio input, so only a named voice (applied by re-voicing) is possible.
 *  "Anchor" (carry a generated clip's voice forward) needs a clip and arrives with canvases. */
export function allowedVoiceModes(personType: PersonType | null): AvatarVoiceMode[] {
  if (personType === "generic") return ["native", "named"];
  if (personType === "specific") return ["named"];
  return [];
}

export function isVoiceAllowed(voice: AvatarVoice, personType: PersonType | null): boolean {
  return allowedVoiceModes(personType).includes(voice.mode);
}

/** A front change can turn a generated avatar into a real person; a native voice is then no
 *  longer possible and is dropped. A named voice survives any front change. */
export function voiceAfterFrontChange(
  voice: AvatarVoice | null,
  nextPersonType: PersonType,
): AvatarVoice | null {
  if (!voice) return null;
  return isVoiceAllowed(voice, nextPersonType) ? voice : null;
}

export function avatarVoiceLabel(voice: AvatarVoice | null): string | null {
  if (!voice) return null;
  return voice.mode === "native" ? "Engine's own voice" : voice.name;
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
export function pickerVoiceToAvatarVoice(voice: PickerVoice): AvatarVoice {
  return {
    mode: "named",
    voiceId: voice.voiceId,
    name: voice.name,
    labels: { ...voice.labels },
    previewUrl: voice.previewUrl,
  };
}
