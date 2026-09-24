"use client";

import { Check, Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatLabel } from "@/lib/elevenlabs/voice-filters";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

type Props = {
  voice: PickerVoice;
  selected: boolean;
  playing: boolean;
  saving: boolean;
  saveError: string | null;
  onSelect: () => void;
  onTogglePreview: () => void;
};

// D283 — one voice: inline preview, name, two labels, one-line description, price badge, selected check.
export function VideoGenVoicePickerRow({ voice, selected, playing, saving, saveError, onSelect, onTogglePreview }: Props) {
  const labels = [voice.labels.gender, voice.labels.accent ?? voice.labels.language].filter(Boolean) as string[];
  return (
    <div className="flex flex-col">
      <div className={cn("flex items-center gap-2 rounded-lg px-1.5 py-1", selected && "bg-primary/5")}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="nodrag shrink-0"
          aria-label={`${playing ? "Stop" : "Play"} preview of ${voice.name}`}
          disabled={!voice.previewUrl}
          onClick={onTogglePreview}
        >
          {playing ? <Pause className="size-4" strokeWidth={1.5} /> : <Play className="size-4" strokeWidth={1.5} />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="nodrag h-auto min-w-0 flex-1 justify-start gap-2 px-1.5 py-1 text-left"
          onClick={onSelect}
          disabled={saving}
          aria-pressed={selected}
          data-voice-row
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium">{voice.name}</span>
              {voice.priceMultiplier > 1 && (
                <Badge variant="secondary" title={`Costs ${voice.priceMultiplier}× the standard rate`}>
                  {voice.priceMultiplier}×
                </Badge>
              )}
            </span>
            {voice.description && (
              <span className="truncate text-xs text-muted-foreground">{voice.description}</span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {labels.map((l) => (
              <Badge key={l} variant="outline" className="text-[0.65rem]">{formatLabel(l)}</Badge>
            ))}
          </span>
          {saving ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" strokeWidth={1.5} />
          ) : selected ? (
            <Check className="size-4 shrink-0 text-primary" strokeWidth={1.5} />
          ) : null}
        </Button>
      </div>
      {saveError && <p className="px-10 pb-1 text-xs text-destructive">{saveError}</p>}
    </div>
  );
}
