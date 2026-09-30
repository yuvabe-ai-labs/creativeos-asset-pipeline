"use client";

import { Mic, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RowVoice } from "@/lib/ugc/board";

type Props = {
  voice: RowVoice | null;
  note: string;
  onNote: (text: string) => void;
  onClear: () => void;
};

// The row's voice anchor, shown under the video tiles because it's a Seedance input.
// When set, every generation for this face sends it as reference_audio (@Audio 1) with the
// description — the vendor's own advice for keeping a referenced voice from drifting.
export function VoicePanel({ voice, note, onNote, onClear }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Mic
          className={voice ? "size-3.5 text-primary" : "size-3.5 text-neutral-500"}
          strokeWidth={1.5}
        />
        <span className="text-eyebrow">Voice</span>
      </div>

      {voice ? (
        <div className="flex items-center gap-2">
          <audio src={voice.dataUrl} controls className="h-8 w-56" />
          <span className="text-xs text-neutral-500">
            From {voice.source} · {voice.seconds.toFixed(1)}s · sent as @Audio 1
          </span>
          <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Remove voice">
            <X className="size-3.5" strokeWidth={1.5} />
          </Button>
        </div>
      ) : (
        <span className="text-xs text-neutral-500">
          None yet. Each clip gets a new voice until you press 🎙 on a clip you like.
        </span>
      )}

      <Input
        value={note}
        onChange={(e) => onNote(e.target.value)}
        placeholder="Describe the voice: age, accent, energy…"
        title="Added to every prompt while a voice is set"
        className="h-8 min-w-56 flex-1 text-xs"
      />
    </div>
  );
}
