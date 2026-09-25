// D284 — every timing-safe ElevenLabs speech-to-speech setting. Speed is deliberately absent:
// it changes timing and would break lip sync.
import { z } from "zod";

export const VOICE_CHANGE_MODELS = [
  { value: "eleven_multilingual_sts_v2", label: "Multilingual" },
  { value: "eleven_english_sts_v2", label: "English" },
] as const;

const percent = z.number().int().min(0).max(100);

export const VoiceChangeSettingsSchema = z.object({
  stability: percent,
  similarity: percent,
  style: percent,
  speakerBoost: z.boolean(),
  removeBackgroundNoise: z.boolean(),
  modelId: z.enum(["eleven_multilingual_sts_v2", "eleven_english_sts_v2"]),
  seed: z.number().int().min(0).max(4294967295).optional(),
});

export type VoiceChangeSettings = z.infer<typeof VoiceChangeSettingsSchema>;

/** ElevenLabs' own defaults (style 0 is also their recommendation). */
export const DEFAULT_VOICE_CHANGE_SETTINGS: VoiceChangeSettings = {
  stability: 50,
  similarity: 75,
  style: 0,
  speakerBoost: true,
  removeBackgroundNoise: false,
  modelId: "eleven_multilingual_sts_v2",
};

export function elevenLabsVoiceSettings(s: VoiceChangeSettings) {
  return {
    stability: s.stability / 100,
    similarity_boost: s.similarity / 100,
    style: s.style / 100,
    use_speaker_boost: s.speakerBoost,
  };
}
