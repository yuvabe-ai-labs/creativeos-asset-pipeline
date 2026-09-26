"use client";

import { Search, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { hasActiveFilters } from "@/lib/elevenlabs/voice-filters";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import { useVoiceBrowser, type VoiceTab } from "@/hooks/use-voice-browser";
import { VideoGenVoicePickerFilters } from "./video-gen-voice-picker-filters";
import { VideoGenVoicePickerList } from "./video-gen-voice-picker-list";

// D284 — the voice picker dialog's body, laid out like ElevenLabs' voice library: filter sidebar on
// the left; tabs, search and the voice list on the right. Fills the dialog's fixed height; each
// pane scrolls on its own.
export function VideoGenChangeVoiceBrowser({ selectedId, onSelect }: { selectedId: string | null; onSelect: (v: PickerVoice) => void }) {
  const b = useVoiceBrowser(true);
  const lib = b.tab === "library";
  return (
    <div className="grid h-full min-h-0 grid-cols-[15rem_minmax(0,1fr)]">
      <ScrollArea className="min-h-0 border-r border-border" contentClassName="w-full min-w-0!">
        <div className="px-4 py-3">
          <VideoGenVoicePickerFilters tab={b.tab} filters={b.filters} accountAll={b.accountAll} onFilter={b.setFilter} onClear={b.clearFilters} />
        </div>
      </ScrollArea>

      <div className="flex min-h-0 flex-col gap-3 px-4 pt-3">
        <div className="flex items-center gap-3">
          <Tabs value={b.tab} onValueChange={(t) => b.setTab(t as VoiceTab)}>
            <TabsList>
              <TabsTrigger value="account">My voices</TabsTrigger>
              <TabsTrigger value="library">Voice Library</TabsTrigger>
            </TabsList>
          </Tabs>
          <InputGroup className="nodrag flex-1">
            <InputGroupAddon>
              <Search className="size-4" strokeWidth={1.5} />
            </InputGroupAddon>
            <InputGroupInput
              id="voice-picker-search"
              aria-label="Search voices"
              placeholder={lib ? "Search 18,000+ voices…" : "Search your voices…"}
              value={b.filters.search}
              onChange={(e) => b.setFilter("search", e.target.value)}
            />
            {b.filters.search && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton aria-label="Clear search" onClick={() => b.setFilter("search", "")}>
                  <X className="size-3.5" strokeWidth={1.5} />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        </div>

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
    </div>
  );
}
