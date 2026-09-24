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

/**
 * D282 review fix — what the trigger should read, given every state the picker can be in.
 * Pulled out of the component so it's testable without rendering, and so
 * `resolveEffectiveVoiceId` below can share the same "is this id actually in the list" check.
 *
 * Order matters: `blockedReason` (audio off / mock) always wins — it means no voice can apply
 * regardless of what's selected. Then `loading`, matching the previous inline behavior. Only once
 * the list has actually loaded does an unmatched id read as "Unavailable voice" rather than
 * silently falling back to "Original".
 */
export function voiceTriggerLabel({
  value,
  voices,
  loading,
  blockedReason,
}: {
  value: string | null;
  voices: ElevenLabsVoice[];
  loading: boolean;
  blockedReason: string | null;
}): string {
  if (blockedReason) return "Original (no change)";
  if (loading) return "Loading voices…";
  if (value && !voices.some((v) => v.voiceId === value)) return "Unavailable voice";
  const selected = voices.find((v) => v.voiceId === value);
  return selected?.name ?? "Original (no change)";
}

/**
 * D282 review fix — the voice id that should actually be sent/priced, given the loaded list and
 * the audio-off/mock block. A stored `voiceId` that isn't in the loaded voices (deleted from the
 * ElevenLabs account, or the list request errored) must never reach the request or the estimate —
 * see video-gen-focus-view.tsx's `effectiveVoiceId`. While the list is still loading, the id is
 * kept as-is (the previous behavior): there's nothing to compare it against yet.
 */
export function resolveEffectiveVoiceId({
  value,
  voices,
  loading,
  error,
  blockedReason,
}: {
  value: string | null;
  voices: ElevenLabsVoice[];
  loading: boolean;
  error: string | null;
  blockedReason: string | null;
}): string | null {
  if (!value) return null;
  if (blockedReason) return null;
  if (error) return null;
  if (!loading && !voices.some((v) => v.voiceId === value)) return null;
  return value;
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
  // A voice-LIST error must not strand the node on a voice it can no longer confirm: "Original
  // (no change)" has to stay pickable so the operator can clear it. Only `loading` (nothing to
  // pick yet) and `blockedReason` (no voice can apply at all) actually disable the control.
  const disabled = Boolean(blockedReason) || loading;

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
              {voiceTriggerLabel({ value, voices, loading, blockedReason })}
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
          size="icon-sm"
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
