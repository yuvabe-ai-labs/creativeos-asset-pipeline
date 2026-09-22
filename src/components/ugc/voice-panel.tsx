"use client";

import { Mic, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { RowVoice } from "@/lib/ugc/board";

type Props = {
  voice: RowVoice | null;
  note: string;
  onNote: (text: string) => void;
  onClear: () => void;
};

// The row's voice anchor. When set, every generation for this face sends it as
// reference_audio (@Audio 1) with the description below — the vendor's own advice for
// keeping a referenced voice from drifting.
export function VoicePanel({ voice, note, onNote, onClear }: Props) {
  return (
    <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3">
      <div className="flex items-center gap-1.5">
        <Mic className="size-3.5 text-neutral-500" strokeWidth={1.5} />
        <span className="text-eyebrow">Voice</span>
        {voice && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            onClick={onClear}
            aria-label="Remove voice"
          >
            <X className="size-3.5" strokeWidth={1.5} />
          </Button>
        )}
      </div>

      {voice ? (
        <>
          <audio src={voice.dataUrl} controls className="h-8 w-full" />
          <p className="text-xs text-neutral-500">
            From {voice.source} · {voice.seconds.toFixed(1)}s · sent as @Audio 1
          </p>
        </>
      ) : (
        <p className="text-xs text-neutral-500">
          No voice yet — each clip gets a new voice. Pick a finished clip you like and use its
          mic button to keep that voice.
        </p>
      )}

      <Textarea
        value={note}
        onChange={(e) => onNote(e.target.value)}
        rows={2}
        placeholder="Describe the voice — age, accent, energy…"
        className="text-xs"
      />
      <p className="text-[11px] text-neutral-400">Added to every prompt while a voice is set.</p>
    </div>
  );
}
