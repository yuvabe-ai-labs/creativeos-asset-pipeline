"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasActiveFilters } from "@/lib/elevenlabs/voice-filters";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import { useVoiceBrowser, type VoiceTab } from "@/hooks/use-voice-browser";
import { VideoGenVoicePickerFilters } from "./video-gen-voice-picker-filters";
import { VideoGenVoicePickerList } from "./video-gen-voice-picker-list";

// D284 — the voice editor's browser: My voices / Voice Library, search, filters, rows with
// preview. A fixed-height list inside the scrolling centre column.
export function VideoGenChangeVoiceBrowser({ selectedId, onSelect }: { selectedId: string | null; onSelect: (v: PickerVoice) => void }) {
  const b = useVoiceBrowser(true);
  const lib = b.tab === "library";
  return (
    <div className="flex flex-col gap-3">
      <Tabs value={b.tab} onValueChange={(t) => b.setTab(t as VoiceTab)}>
        <TabsList>
          <TabsTrigger value="account">My voices</TabsTrigger>
          <TabsTrigger value="library">Voice Library</TabsTrigger>
        </TabsList>
      </Tabs>
      <VideoGenVoicePickerFilters tab={b.tab} filters={b.filters} accountAll={b.accountAll} onFilter={b.setFilter} onClear={b.clearFilters} />
      <VideoGenVoicePickerList
        tab={b.tab}
        voices={lib ? b.library.voices : b.accountVoices}
        selectedId={selectedId}
        loading={lib ? b.library.loading : b.accountLoading}
        error={lib ? b.library.error : b.accountError}
        filtered={hasActiveFilters(b.filters)}
        infinite={lib ? { hasMore: b.library.hasMore, onMore: b.library.loadMore } : null}
        playingId={b.preview.playingId}
        onSelect={onSelect}
        onTogglePreview={b.preview.toggle}
        onRetry={b.retry}
        onClearFilters={b.clearFilters}
      />
    </div>
  );
}
