"use client";

import { AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

/** Marker "voice": the character speaks with the audio of the generated preview on the right. */
export const PREVIEW_AUDIO_VOICE: PickerVoice = {
  voiceId: "preview-audio",
  source: "account",
  name: "Preview audio",
  description: "The voice from the generated preview",
  previewUrl: null,
  labels: {},
  category: "preview",
  priceMultiplier: 1,
};

// Random-character alternative to a custom voice: reuse the preview's own audio.
export function AvatarPreviewAudioButton({ onUse }: { onUse: (voice: PickerVoice) => void }) {
  return (
    <Button
      variant="outline"
      className="h-auto min-h-11 gap-2 border-dashed border-primary/40 py-2 hover:bg-primary/5"
      onClick={() => onUse(PREVIEW_AUDIO_VOICE)}
    >
      <AudioLines className="size-4" strokeWidth={1.5} />
      Use preview audio
    </Button>
  );
}
