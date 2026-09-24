"use client";

import { useRef, useState } from "react";
import { ChevronDown, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { hasActiveFilters } from "@/lib/elevenlabs/voice-filters";
import { elevenLabsApi } from "@/lib/elevenlabs/api";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import { useVoiceBrowser, type VoiceTab } from "@/hooks/use-voice-browser";
import { VideoGenVoicePickerFilters } from "./video-gen-voice-picker-filters";
import { VideoGenVoicePickerList } from "./video-gen-voice-picker-list";
import { VideoGenVoicePickerMeta } from "./video-gen-voice-picker-meta";

/** A Library pick that's been selected optimistically and is saving to the account in the background. */
export type PendingVoiceSave = { voice: PickerVoice; status: "saving" };

/** What the trigger reads. `blockedReason` wins; then a pending save; then loading; then a confirmed-gone voice. */
export function voiceTriggerLabel(a: {
  value: string | null;
  selected: PickerVoice | null;
  loading: boolean;
  notFound: boolean;
  blockedReason: string | null;
  pending: PendingVoiceSave | null;
}): string {
  if (a.blockedReason || !a.value) return "Original (no change)";
  if (a.pending) return a.pending.voice.name;
  if (a.selected) return a.selected.name;
  if (a.loading) return "Loading voice…";
  if (a.notFound) return "Unavailable voice";
  return "Selected voice";
}

/**
 * The voice id to send and price. Dropped when blocked (audio off / mock) or when the lookup
 * CONFIRMED the account no longer has it; kept while loading, on a lookup error, or while a
 * Library pick's background save is still pending (Generate is separately disabled for that
 * case — see video-gen-focus-view.tsx) — so nothing here ever silently generates without the
 * voice (the route gives its own clear 400 if it's truly gone).
 */
export function resolveEffectiveVoiceId(a: {
  value: string | null;
  loading: boolean;
  notFound: boolean;
  error: string | null;
  blockedReason: string | null;
  pending: PendingVoiceSave | null;
}): string | null {
  if (!a.value || a.blockedReason) return null;
  if (a.pending) return a.value;
  if (a.notFound) return null;
  return a.value;
}

type Props = {
  value: string | null;
  onChange: (voiceId: string | null) => void;
  pendingVoice: PendingVoiceSave | null;
  onPendingChange: (pending: PendingVoiceSave | null) => void;
  blockedReason: string | null;
  selected: PickerVoice | null;
  selectedLoading: boolean;
  selectedNotFound: boolean;
};

// D283 — the Video Gen voice picker: trigger + popover over My voices and the Voice Library.
// Picking a Library voice is optimistic (it used to feel slow, waiting on the save before
// selecting) — see `pickLibrary`.
export function VideoGenVoicePicker({
  value, onChange, pendingVoice, onPendingChange, blockedReason, selected, selectedLoading, selectedNotFound,
}: Props) {
  const [open, setOpen] = useState(false);
  const b = useVoiceBrowser(open);
  // Guards two Library picks racing: only the most recently started pick's result is applied.
  const pickReq = useRef(0);

  const label = voiceTriggerLabel({
    value, selected, loading: selectedLoading, notFound: selectedNotFound, blockedReason, pending: pendingVoice,
  });
  // While a save is pending, the trigger/estimate read the pending voice (name, labels, preview,
  // multiplier) instantly rather than the (suppressed) lookup — see focus view's `!pendingVoice`
  // gate on useSelectedVoice.
  const triggerVoice = pendingVoice ? pendingVoice.voice : selected;

  function pickAccount(voice: PickerVoice) {
    onChange(voice.voiceId);
    setOpen(false);
  }

  /**
   * Optimistic Library pick: select and close instantly, save to the account in the background,
   * then reconcile. `previousVoiceId` lets a refusal put the node back exactly where it was.
   */
  async function pickLibrary(voice: PickerVoice) {
    if (pendingVoice) return; // ignore further picks while one is already saving
    const previousVoiceId = value;
    const myReq = ++pickReq.current;
    onChange(voice.voiceId);
    setOpen(false);
    onPendingChange({ voice, status: "saving" });
    try {
      const saved = await elevenLabsApi.saveVoice({
        publicOwnerId: voice.publicOwnerId ?? "",
        voiceId: voice.voiceId,
        name: voice.name,
      });
      if (myReq !== pickReq.current) return; // superseded by a newer pick
      if (saved.voiceId !== voice.voiceId) onChange(saved.voiceId);
      onPendingChange(null);
    } catch (e) {
      if (myReq !== pickReq.current) return;
      onChange(previousVoiceId);
      onPendingChange(null);
      const message = e instanceof Error ? e.message : "Could not save this voice.";
      toast.error(`Couldn't use "${voice.name}": ${message}`);
    }
  }

  function pick(voice: PickerVoice | null) {
    if (!voice) {
      onChange(null);
      setOpen(false);
      return;
    }
    if (voice.source === "account") pickAccount(voice);
    else void pickLibrary(voice);
  }

  const lib = b.tab === "library";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            disabled={Boolean(blockedReason)}
            render={
              <Button type="button" variant="outline" className="nodrag h-auto min-h-8 flex-1 justify-between gap-2 py-1.5 text-left" aria-label={`Voice: ${label}`} />
            }
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm">{label}</span>
              {!blockedReason && pendingVoice && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" strokeWidth={1.5} />
                  Adding to your voices…
                </span>
              )}
              {!blockedReason && !pendingVoice && triggerVoice && (
                <VideoGenVoicePickerMeta labels={triggerVoice.labels} fields={["gender", "language", "accent"]} />
              )}
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
                tab={b.tab}
                voices={lib ? b.library.voices : b.accountVoices}
                selectedId={value}
                loading={lib ? b.library.loading : b.accountLoading}
                error={lib ? b.library.error : b.accountError}
                filtered={hasActiveFilters(b.filters)}
                infinite={lib ? { hasMore: b.library.hasMore, onMore: b.library.loadMore } : null}
                playingId={b.preview.playingId}
                onSelect={pick}
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
          aria-label={triggerVoice ? `Play preview of ${triggerVoice.name}` : "Play voice preview"}
          disabled={!triggerVoice?.previewUrl || Boolean(blockedReason)}
          onClick={() => triggerVoice && b.preview.toggle(triggerVoice)}
        >
          {triggerVoice && b.preview.playingId === triggerVoice.voiceId ? (
            <Pause className="size-4" strokeWidth={1.5} />
          ) : (
            <Play className="size-4" strokeWidth={1.5} />
          )}
        </Button>
      </div>
      {blockedReason && <p className="text-xs text-muted-foreground">{blockedReason}</p>}
      {!blockedReason && triggerVoice && triggerVoice.priceMultiplier > 1 && (
        <p className="text-xs text-muted-foreground">This voice costs {triggerVoice.priceMultiplier}× the standard voice-change rate.</p>
      )}
      {!blockedReason && triggerVoice && (
        <p className="text-xs text-muted-foreground">The clip&apos;s voice is changed after it generates. Timing stays the same.</p>
      )}
    </div>
  );
}
