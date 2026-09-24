"use client";

import { useState } from "react";
import { ChevronDown, Pause, Play } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { formatLabel, hasActiveFilters } from "@/lib/elevenlabs/voice-filters";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import { useVoiceBrowser, type VoiceTab } from "@/hooks/use-voice-browser";
import { VideoGenVoicePickerFilters } from "./video-gen-voice-picker-filters";
import { VideoGenVoicePickerList } from "./video-gen-voice-picker-list";

/** What the trigger reads. `blockedReason` wins; then loading; then a confirmed-gone voice. */
export function voiceTriggerLabel(a: {
  value: string | null;
  selected: PickerVoice | null;
  loading: boolean;
  notFound: boolean;
  blockedReason: string | null;
}): string {
  if (a.blockedReason || !a.value) return "Original (no change)";
  if (a.selected) return a.selected.name;
  if (a.loading) return "Loading voice…";
  if (a.notFound) return "Unavailable voice";
  return "Selected voice";
}

/**
 * The voice id to send and price. Dropped when blocked (audio off / mock) or when the lookup
 * CONFIRMED the account no longer has it; kept while loading or on a lookup error, so a flaky
 * lookup never silently generates without the voice (the route gives its own clear 400).
 */
export function resolveEffectiveVoiceId(a: {
  value: string | null;
  loading: boolean;
  notFound: boolean;
  error: string | null;
  blockedReason: string | null;
}): string | null {
  if (!a.value || a.blockedReason || a.notFound) return null;
  return a.value;
}

type Props = {
  value: string | null;
  onChange: (voiceId: string | null) => void;
  blockedReason: string | null;
  selected: PickerVoice | null;
  selectedLoading: boolean;
  selectedNotFound: boolean;
};

// D283 — the Video Gen voice picker: trigger + popover over My voices and the Voice Library.
export function VideoGenVoicePicker({ value, onChange, blockedReason, selected, selectedLoading, selectedNotFound }: Props) {
  const [open, setOpen] = useState(false);
  const b = useVoiceBrowser(open);
  const label = voiceTriggerLabel({ value, selected, loading: selectedLoading, notFound: selectedNotFound, blockedReason });
  const subLabels = !blockedReason && selected
    ? [selected.labels.gender, selected.labels.accent].filter(Boolean).map((l) => formatLabel(l as string)).join(" · ")
    : "";

  async function pick(voice: PickerVoice | null) {
    if (!voice) {
      onChange(null);
      setOpen(false);
      return;
    }
    const id = await b.choose(voice);
    if (id) {
      onChange(id);
      setOpen(false);
    }
  }

  const lib = b.tab === "library";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            disabled={Boolean(blockedReason)}
            render={
              <Button type="button" variant="outline" className="nodrag h-auto min-h-8 flex-1 justify-between gap-2 py-1.5 text-left" aria-label="Voice" />
            }
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm">{label}</span>
              {subLabels && <span className="truncate text-xs text-muted-foreground">{subLabels}</span>}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[440px] max-w-[calc(100vw-2rem)] p-3">
            <div className="flex flex-col gap-3">
              <Tabs value={b.tab} onValueChange={(t) => b.setTab(t as VoiceTab)}>
                <TabsList>
                  <TabsTrigger value="account">My voices</TabsTrigger>
                  <TabsTrigger value="library">Voice Library</TabsTrigger>
                </TabsList>
              </Tabs>
              <VideoGenVoicePickerFilters
                tab={b.tab}
                filters={b.filters}
                accountAll={b.accountAll}
                onFilter={b.setFilter}
                onClear={b.clearFilters}
              />
              <VideoGenVoicePickerList
                voices={lib ? b.library.voices : b.accountVoices}
                selectedId={value}
                loading={lib ? b.library.loading : b.accountLoading}
                error={lib ? b.library.error : b.accountError}
                filtered={hasActiveFilters(b.filters)}
                infinite={lib ? { hasMore: b.library.hasMore, onMore: b.library.loadMore } : null}
                playingId={b.preview.playingId}
                saving={b.saving}
                onSelect={(v) => void pick(v)}
                onTogglePreview={b.preview.toggle}
                onRetry={b.retry}
                onClearFilters={b.clearFilters}
              />
            </div>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="nodrag shrink-0"
          aria-label={selected ? `Play preview of ${selected.name}` : "Play voice preview"}
          disabled={!selected?.previewUrl || Boolean(blockedReason)}
          onClick={() => selected && b.preview.toggle(selected)}
        >
          {selected && b.preview.playingId === selected.voiceId ? (
            <Pause className="size-4" strokeWidth={1.5} />
          ) : (
            <Play className="size-4" strokeWidth={1.5} />
          )}
        </Button>
      </div>
      {blockedReason && <p className="text-xs text-muted-foreground">{blockedReason}</p>}
      {!blockedReason && selected && selected.priceMultiplier > 1 && (
        <p className="text-xs text-muted-foreground">This voice costs {selected.priceMultiplier}× the standard voice-change rate.</p>
      )}
      {!blockedReason && selected && (
        <p className="text-xs text-muted-foreground">The clip&apos;s voice is changed after it generates. Timing stays the same.</p>
      )}
    </div>
  );
}
