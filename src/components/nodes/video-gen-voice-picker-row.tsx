"use client";

import { AudioLines, Check, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatLabel } from "@/lib/elevenlabs/voice-filters";
import { languageName } from "@/lib/elevenlabs/voice-labels";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

type Props = {
  voice: PickerVoice;
  selected: boolean;
  playing: boolean;
  onSelect: () => void;
  onTogglePreview: () => void;
};

// D284 — one compact voice row, like ElevenLabs' voice library: round play button, name (with the
// price badge), language, accent, "+N" for the other labels, and "Use" on hover/focus — or
// "Selected" for the chosen voice. The description is the name's tooltip.
export function VideoGenVoicePickerRow({ voice, selected, playing, onSelect, onTogglePreview }: Props) {
  const { language, accent, gender, age, useCase, descriptive } = voice.labels;
  const extra = [gender, age, useCase, descriptive].filter((v): v is string => Boolean(v)).map(formatLabel);

  return (
    <div
      className={cn(
        "group flex h-14 items-center gap-3 rounded-lg px-2",
        selected ? "bg-primary/5" : "hover:bg-muted",
      )}
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="nodrag shrink-0 rounded-full"
        aria-label={`${playing ? "Stop" : "Play"} preview of ${voice.name}`}
        disabled={!voice.previewUrl}
        onClick={onTogglePreview}
      >
        {playing ? (
          <AudioLines className="size-4 text-primary motion-safe:animate-pulse" strokeWidth={1.5} />
        ) : (
          <Play className="size-4" strokeWidth={1.5} />
        )}
      </Button>

      <span className="flex min-w-0 flex-1 items-center gap-1.5" title={voice.description ?? undefined}>
        <span className="truncate text-sm font-medium">{voice.name}</span>
        {voice.priceMultiplier > 1 && (
          <Badge variant="secondary" title={`Costs ${voice.priceMultiplier}× the standard rate`}>
            {voice.priceMultiplier}×
          </Badge>
        )}
      </span>

      <span className="hidden w-56 shrink-0 items-center gap-2 text-sm sm:flex">
        {language && <span className="truncate">{languageName(language)}</span>}
        {accent && <span className="truncate text-muted-foreground">{formatLabel(accent)}</span>}
        {extra.length > 0 && (
          <Badge variant="outline" title={extra.join(" · ")}>+{extra.length}</Badge>
        )}
      </span>

      <span className="flex w-24 shrink-0 justify-end">
        {selected ? (
          <span className="flex items-center gap-1 text-sm font-medium text-primary">
            <Check className="size-4" strokeWidth={1.5} /> Selected
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            className="nodrag opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            onClick={onSelect}
            data-voice-row
          >
            Use
          </Button>
        )}
      </span>
    </div>
  );
}
