"use client";

import { useState } from "react";
import { AudioLines, Check, Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoicePreview } from "@/hooks/use-voice-preview";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import { VoiceCloneForm } from "@/components/voice/voice-clone-form";

type Props = {
  clientId: string;
  /** The avatar's name: the voice's name is filled in with it. */
  name: string;
  /** The voice made from a recording — saved, or being saved — else null. */
  voice: PickerVoice | null;
  saving: boolean;
  onCreated: (voice: PickerVoice) => void;
};

// D301 — "Create a custom voice": a recording in, a voice for this client out (D292's clone),
// declared as the avatar's voice. Once there is one, it is shown ready to play, with a way to make
// another from a different recording.
export function AvatarVoiceCustomPanel({ clientId, name, voice, saving, onCreated }: Props) {
  const [replacing, setReplacing] = useState(false);
  const sample = useVoicePreview();
  const made = voice;

  if (made && !replacing) {
    const playing = sample.playingId === made.voiceId;
    return (
      <div className="flex flex-col gap-3 rounded-xl border p-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Your custom voice is ready</p>
          {saving ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
              <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
              Saving…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success-text">
              <Check className="size-3.5" strokeWidth={1.5} />
              Saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
          <Button
            variant="outline"
            size="icon-sm"
            className="rounded-full"
            disabled={!made.previewUrl}
            aria-label={playing ? `Stop ${made.name}` : `Play ${made.name}`}
            onClick={() => sample.toggle(made)}
          >
            {playing ? <Pause className="size-3.5" strokeWidth={1.5} /> : <Play className="size-3.5" strokeWidth={1.5} />}
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{made.name}</p>
            <p className="text-xs text-muted-foreground">Added to this client&apos;s voices</p>
          </div>
        </div>
        <Button
          variant="outline"
          className="self-start"
          disabled={saving}
          onClick={() => { sample.stop(); setReplacing(true); }}
        >
          Use a different recording
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <AudioLines className="size-4 text-primary" strokeWidth={1.5} />
        Use a voice from a recording
      </p>
      <VoiceCloneForm
        inline
        clientId={clientId}
        defaultName={name}
        onCloned={(created) => { setReplacing(false); onCreated(created); }}
      />
    </div>
  );
}
