"use client";

import { AudioLines, Check, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { VideoGenVoicePickerMeta } from "./video-gen-voice-picker-meta";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

type Props = {
  voice: PickerVoice;
  selected: boolean;
  playing: boolean;
  onSelect: () => void;
  onTogglePreview: () => void;
};

// D283 — one voice row: play/pause, name + price badge + selected check, one-line description,
// meta chips (gender/age/language/accent/use case). Picking a Library row is now instant (the
// parent picker selects optimistically and saves in the background), so there's no per-row
// saving/error state here any more.
export function VideoGenVoicePickerRow({ voice, selected, playing, onSelect, onTogglePreview }: Props) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-1.5 py-1.5",
        selected ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-muted",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="nodrag shrink-0"
        aria-label={`${playing ? "Stop" : "Play"} preview of ${voice.name}`}
        disabled={!voice.previewUrl}
        onClick={onTogglePreview}
      >
        {playing ? (
          <AudioLines className="size-4 motion-safe:animate-pulse" strokeWidth={1.5} />
        ) : (
          <Play className="size-4" strokeWidth={1.5} />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="nodrag h-auto min-w-0 flex-1 flex-col items-start gap-0.5 px-1.5 py-1 text-left"
        onClick={onSelect}
        aria-pressed={selected}
        data-voice-row
      >
        <span className="flex w-full items-center gap-1.5">
          <span className="truncate text-sm font-medium">{voice.name}</span>
          {voice.priceMultiplier > 1 && (
            <Badge variant="secondary" title={`Costs ${voice.priceMultiplier}× the standard rate`}>
              {voice.priceMultiplier}×
            </Badge>
          )}
          {selected && <Check className="ml-auto size-4 shrink-0 text-primary" strokeWidth={1.5} />}
        </span>
        {voice.description && (
          <span className="w-full truncate text-xs text-muted-foreground">{voice.description}</span>
        )}
        <VideoGenVoicePickerMeta labels={voice.labels} />
      </Button>
    </div>
  );
}
