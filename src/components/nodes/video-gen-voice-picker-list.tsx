"use client";

import { Check } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { InfiniteScrollSentinel } from "@/components/shared/infinite-scroll-sentinel";
import { CUSTOM_VOICE_CATEGORIES } from "@/lib/elevenlabs/constants";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import type { VoiceTab } from "@/hooks/use-voice-browser";
import { VideoGenVoicePickerRow } from "./video-gen-voice-picker-row";

type Props = {
  tab: VoiceTab;
  voices: PickerVoice[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  filtered: boolean;
  infinite: { hasMore: boolean; onMore: () => void } | null;
  playingId: string | null;
  onSelect: (voice: PickerVoice | null) => void;
  onTogglePreview: (voice: PickerVoice) => void;
  onRetry: () => void;
  onClearFilters: () => void;
};

// D283 — "Original" first, then voice rows; on My voices, grouped under "Your voices" (custom
// categories) / "Default voices" (premade) when both are present. Skeleton / empty / error
// states; infinite scroll for the Library.
export function VideoGenVoicePickerList(p: Props) {
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-voice-row]"));
    const i = rows.indexOf(document.activeElement as HTMLElement);
    const next = rows[e.key === "ArrowDown" ? Math.min(i + 1, rows.length - 1) : Math.max(i - 1, 0)];
    next?.focus();
    e.preventDefault();
  }

  function row(v: PickerVoice) {
    return (
      <VideoGenVoicePickerRow
        key={`${v.source}:${v.voiceId}`}
        voice={v}
        selected={p.selectedId === v.voiceId}
        playing={p.playingId === v.voiceId}
        onSelect={() => p.onSelect(v)}
        onTogglePreview={() => p.onTogglePreview(v)}
      />
    );
  }

  const initialLoading = p.loading && p.voices.length === 0;
  const customVoices = p.tab === "account" ? p.voices.filter((v) => CUSTOM_VOICE_CATEGORIES.has(v.category)) : [];
  const defaultVoices = p.tab === "account" ? p.voices.filter((v) => !CUSTOM_VOICE_CATEGORIES.has(v.category)) : [];
  const showGroups = p.tab === "account" && customVoices.length > 0 && defaultVoices.length > 0;

  return (
    // Vertical-only list: rows shrink to the popover width (long descriptions wrap/clamp) instead
    // of the content growing wider than the viewport and scrolling sideways.
    <ScrollArea className="h-[340px]" contentClassName="w-full min-w-0!">
      <div className="flex flex-col gap-0.5 pr-2" onKeyDown={onKeyDown}>
        <Button
          type="button"
          variant="ghost"
          className="nodrag h-9 justify-between px-2.5 text-sm"
          onClick={() => p.onSelect(null)}
          aria-pressed={p.selectedId === null}
          data-voice-row
        >
          Original (no change)
          {p.selectedId === null && <Check className="size-4 text-primary" strokeWidth={1.5} />}
        </Button>

        {initialLoading &&
          Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="mx-1.5 my-1 h-9" />)}

        {!initialLoading && p.error && (
          <div className="flex items-center justify-between gap-2 px-2.5 py-3 text-xs text-muted-foreground">
            <span>{p.error}</span>
            <Button type="button" variant="outline" size="sm" className="nodrag" onClick={p.onRetry}>Retry</Button>
          </div>
        )}

        {!initialLoading && !p.error && p.voices.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-2.5 py-6 text-xs text-muted-foreground">
            No voices match.
            {p.filtered && (
              <Button type="button" variant="outline" size="sm" className="nodrag" onClick={p.onClearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        )}

        {!initialLoading && !p.error && showGroups && (
          <>
            <div className="text-eyebrow px-2.5 pt-2 pb-1 text-muted-foreground/80">Your voices</div>
            {customVoices.map(row)}
            <div className="text-eyebrow px-2.5 pt-2 pb-1 text-muted-foreground/80">Default voices</div>
            {defaultVoices.map(row)}
          </>
        )}

        {!initialLoading && !p.error && !showGroups && p.voices.map(row)}

        {p.infinite && p.infinite.hasMore && !p.error && p.voices.length > 0 && (
          <InfiniteScrollSentinel onVisible={p.infinite.onMore} loading={p.loading} scrollRoot="nearest" />
        )}
      </div>
    </ScrollArea>
  );
}
