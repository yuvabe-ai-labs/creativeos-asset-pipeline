"use client";

import { useState } from "react";
import { ChevronDown, Loader2, Pause, Play } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import { VideoGenChangeVoiceBrowser } from "./video-gen-change-voice-browser";
import { VideoGenVoicePickerMeta } from "./video-gen-voice-picker-meta";

type Props = {
  voice: PickerVoice | null;
  /** A Library pick is still being saved to the ElevenLabs account. */
  saving: boolean;
  playing: boolean;
  onTogglePreview: () => void;
  onSelect: (voice: PickerVoice) => void;
};

// D284 — Edit voice's voice field: the chosen voice (name, labels, price badge) with a preview
// button; clicking it opens the voice picker dialog (filter sidebar, tabs, search, compact rows
// with play and "Use"). Using a voice closes it.
export function VideoGenChangeVoicePicker({ voice, saving, playing, onTogglePreview, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="nodrag h-auto min-h-10 flex-1 justify-between gap-2 py-2 text-left"
              aria-label={voice ? `Voice: ${voice.name}` : "Pick a voice"}
            />
          }
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            {voice ? (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{voice.name}</span>
                  {voice.priceMultiplier > 1 && <Badge variant="secondary">{voice.priceMultiplier}×</Badge>}
                </span>
                {saving ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" strokeWidth={1.5} /> Adding to your voices…
                  </span>
                ) : (
                  <VideoGenVoicePickerMeta labels={voice.labels} fields={["gender", "language", "accent"]} />
                )}
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Pick a voice</span>
            )}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        </DialogTrigger>
        {/* A large centred dialog, like ElevenLabs' own voice picker: fixed size, so nothing moves
            between the loading placeholders and the loaded list. */}
        <DialogContent className="grid h-[min(40rem,calc(100vh-4rem))] w-[min(64rem,calc(100vw-2rem))] grid-rows-[auto_minmax(0,1fr)] gap-0 p-0 sm:max-w-none">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle>Choose a voice</DialogTitle>
          </DialogHeader>
          <VideoGenChangeVoiceBrowser
            selectedId={voice?.voiceId ?? null}
            onSelect={(v) => {
              onSelect(v);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="nodrag shrink-0"
        aria-label={voice ? `${playing ? "Stop" : "Play"} preview of ${voice.name}` : "Play voice preview"}
        disabled={!voice?.previewUrl}
        onClick={onTogglePreview}
      >
        {playing ? <Pause className="size-4" strokeWidth={1.5} /> : <Play className="size-4" strokeWidth={1.5} />}
      </Button>
    </div>
  );
}
