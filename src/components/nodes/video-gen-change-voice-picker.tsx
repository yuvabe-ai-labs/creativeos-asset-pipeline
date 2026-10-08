"use client";

import { useState } from "react";
import { ChevronDown, ChevronLeft, Loader2, Pause, Play, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import { VideoGenChangeVoiceBrowser } from "./video-gen-change-voice-browser";
import { VideoGenVoicePickerMeta } from "./video-gen-voice-picker-meta";
import { VoiceCloneForm } from "@/components/voice/voice-clone-form";

type Props = {
  voice: PickerVoice | null;
  /** A Library pick is still being saved to the ElevenLabs account. */
  saving: boolean;
  /** What the field says while `saving`. Video Gen is adding a Library voice to the account; the
   *  Avatar Studio is saving the avatar's declaration, which may be an account voice already. */
  savingLabel?: string;
  playing: boolean;
  onTogglePreview: () => void;
  onSelect: (voice: PickerVoice) => void;
  /** D292 — scope the picker to one client: a "This client" tab, and Clone voice. */
  clientId?: string;
};

// D284 — Edit voice's voice field: the chosen voice (name, labels, price badge) with a preview
// button; clicking it opens the voice picker dialog (filter sidebar, tabs, search, compact rows
// with play and "Use"). Using a voice closes it. D292 — with a `clientId`, the header offers Clone
// voice, which swaps the dialog body for the clone form; a cloned voice is used straight away.
export function VideoGenChangeVoicePicker({
  voice, saving, savingLabel = "Adding to your voices…", playing, onTogglePreview, onSelect, clientId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [cloning, setCloning] = useState(false);
  const use = (v: PickerVoice) => {
    onSelect(v);
    setOpen(false);
    setCloning(false);
  };
  return (
    <div className="flex items-center gap-2">
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setCloning(false);
        }}
      >
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
                    <Loader2 className="size-3 animate-spin" strokeWidth={1.5} /> {savingLabel}
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
          <DialogHeader className="flex-row items-center gap-2 border-b border-border px-4 py-3">
            {cloning && (
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Back to voices" onClick={() => setCloning(false)}>
                <ChevronLeft className="size-4" strokeWidth={1.5} />
              </Button>
            )}
            <DialogTitle>{cloning ? "Clone a voice" : "Choose a voice"}</DialogTitle>
            {clientId && !cloning && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                // Clear of the dialog's own close button in the corner.
                className="ml-auto mr-8 border-dashed border-primary/40 text-primary hover:bg-primary/5 hover:text-primary"
                onClick={() => setCloning(true)}
              >
                <Plus className="size-3.5" strokeWidth={1.5} />
                Clone voice
              </Button>
            )}
          </DialogHeader>
          {cloning && clientId ? (
            <VoiceCloneForm clientId={clientId} onCloned={use} />
          ) : (
            <VideoGenChangeVoiceBrowser selectedId={voice?.voiceId ?? null} clientId={clientId} onSelect={use} />
          )}
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
