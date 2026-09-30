"use client";

import { Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import { useVoicePreview } from "@/hooks/use-voice-preview";
import { VideoGenVoicePickerMeta } from "@/components/nodes/video-gen-voice-picker-meta";
import { AvatarVoiceSearchDialog } from "./avatar-voice-search-dialog";
import { AvatarCustomVoiceDialog } from "./avatar-custom-voice-dialog";
import { AvatarPreviewAudioButton } from "./avatar-preview-audio-button";

type Props = {
  voice: PickerVoice | null;
  onSelect: (voice: PickerVoice) => void;
  onClear: () => void;
  /** Random-character page: "Use preview audio" instead of "Create custom voice". */
  usePreviewAudio?: boolean;
};

// Step 3: pick a voice from ElevenLabs, or describe a custom one (or, for a random character,
// reuse the preview's audio). The chosen voice shows as a card with its labels and a preview
// button.
export function AvatarVoiceStep({ voice, onSelect, onClear, usePreviewAudio = false }: Props) {
  const preview = useVoicePreview();
  const playing = voice !== null && preview.playingId === voice.voiceId;
  const described = voice?.category === "generated" || voice?.category === "preview";

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">3. Set a voice</h2>
      <div className="flex flex-wrap gap-3">
        <AvatarVoiceSearchDialog selectedId={voice?.voiceId ?? null} onSelect={onSelect} />
        {usePreviewAudio ? (
          <AvatarPreviewAudioButton onUse={onSelect} />
        ) : (
          <AvatarCustomVoiceDialog onCreate={onSelect} />
        )}
      </div>

      {voice && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-card">
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            disabled={!voice.previewUrl}
            aria-label={`${playing ? "Stop" : "Play"} preview of ${voice.name}`}
            onClick={() => preview.toggle(voice)}
          >
            {playing ? <Pause className="size-4" strokeWidth={1.5} /> : <Play className="size-4" strokeWidth={1.5} />}
          </Button>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium">{voice.name}</span>
              {voice.category === "generated" && <Badge variant="secondary">Custom</Badge>}
            </span>
            {described && voice.description ? (
              <span className="truncate text-xs text-muted-foreground">{voice.description}</span>
            ) : (
              <VideoGenVoicePickerMeta labels={voice.labels} fields={["gender", "language", "accent"]} />
            )}
          </div>
          <Button variant="ghost" size="icon" aria-label="Remove voice" onClick={onClear}>
            <X className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
      )}
    </section>
  );
}
