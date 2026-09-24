"use client";

import { Check } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { InfiniteScrollSentinel } from "@/components/shared/infinite-scroll-sentinel";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import { VideoGenVoicePickerRow } from "./video-gen-voice-picker-row";

type Props = {
  voices: PickerVoice[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  filtered: boolean;
  infinite: { hasMore: boolean; onMore: () => void } | null;
  playingId: string | null;
  saving: { id: string | null; error: string | null };
  onSelect: (voice: PickerVoice | null) => void;
  onTogglePreview: (voice: PickerVoice) => void;
  onRetry: () => void;
  onClearFilters: () => void;
};

// D283 — "Original" first, then voice rows; skeleton / empty / error states; infinite scroll for the Library.
export function VideoGenVoicePickerList(p: Props) {
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-voice-row]"));
    const i = rows.indexOf(document.activeElement as HTMLElement);
    const next = rows[e.key === "ArrowDown" ? Math.min(i + 1, rows.length - 1) : Math.max(i - 1, 0)];
    next?.focus();
    e.preventDefault();
  }

  const initialLoading = p.loading && p.voices.length === 0;
  return (
    <ScrollArea className="h-[340px]">
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

        {p.voices.map((v) => (
          <VideoGenVoicePickerRow
            key={`${v.source}:${v.voiceId}`}
            voice={v}
            selected={p.selectedId === v.voiceId}
            playing={p.playingId === v.voiceId}
            saving={p.saving.id === v.voiceId && !p.saving.error}
            saveError={p.saving.id === v.voiceId ? p.saving.error : null}
            onSelect={() => p.onSelect(v)}
            onTogglePreview={() => p.onTogglePreview(v)}
          />
        ))}

        {p.infinite && p.infinite.hasMore && !p.error && p.voices.length > 0 && (
          <InfiniteScrollSentinel onVisible={p.infinite.onMore} loading={p.loading} scrollRoot="nearest" />
        )}
      </div>
    </ScrollArea>
  );
}
