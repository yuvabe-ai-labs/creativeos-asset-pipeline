"use client";

import { Play } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CUSTOM_VOICE_CATEGORIES } from "@/lib/elevenlabs/constants";
import type { ElevenLabsVoice } from "@/lib/elevenlabs/client";

const ORIGINAL = "original";

export function groupVoices(voices: ElevenLabsVoice[]) {
  return {
    custom: voices.filter((v) => CUSTOM_VOICE_CATEGORIES.has(v.category)),
    library: voices.filter((v) => !CUSTOM_VOICE_CATEGORIES.has(v.category)),
  };
}

type Props = {
  value: string | null;
  onChange: (voiceId: string | null) => void;
  voices: ElevenLabsVoice[];
  loading: boolean;
  error: string | null;
  /** Why no voice can be applied right now (audio off, mock) — disables the control. */
  blockedReason: string | null;
};

// D282 — optional ElevenLabs voice for the Video Gen node. "Original" keeps the model's audio.
export function VideoGenVoiceSelect({ value, onChange, voices, loading, error, blockedReason }: Props) {
  const { custom, library } = groupVoices(voices);
  const selected = voices.find((v) => v.voiceId === value) ?? null;
  const disabled = Boolean(blockedReason) || Boolean(error) || loading;

  function playPreview() {
    if (!selected?.previewUrl) return;
    void new Audio(selected.previewUrl).play().catch(() => undefined);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Select
          value={blockedReason ? ORIGINAL : (value ?? ORIGINAL)}
          onValueChange={(v) => onChange(v === ORIGINAL || v === null ? null : String(v))}
          disabled={disabled}
        >
          <SelectTrigger className="nodrag flex-1 text-sm" aria-label="Voice">
            <SelectValue>
              {loading ? "Loading voices…" : (selected?.name ?? "Original (no change)")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ORIGINAL}>Original (no change)</SelectItem>
            {custom.length > 0 && (
              <SelectGroup>
                <SelectLabel>Your voices</SelectLabel>
                {custom.map((v) => (
                  <SelectItem key={v.voiceId} value={v.voiceId}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {library.length > 0 && (
              <SelectGroup>
                <SelectLabel>ElevenLabs library</SelectLabel>
                {library.map((v) => (
                  <SelectItem key={v.voiceId} value={v.voiceId}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="nodrag shrink-0"
          aria-label="Play voice preview"
          onClick={playPreview}
          disabled={!selected?.previewUrl || disabled}
        >
          <Play className="size-4" strokeWidth={1.5} />
        </Button>
      </div>
      {(blockedReason || error) && (
        <p className="text-xs text-muted-foreground">{blockedReason ?? error}</p>
      )}
      {!blockedReason && !error && selected && (
        <p className="text-xs text-muted-foreground">
          The clip&apos;s voice is changed after it generates. Timing stays the same.
        </p>
      )}
    </div>
  );
}
