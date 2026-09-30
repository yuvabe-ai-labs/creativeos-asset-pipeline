"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import { VideoGenChangeVoiceBrowser } from "@/components/nodes/video-gen-change-voice-browser";

// "Search voice": a search-field-shaped trigger that opens the shared ElevenLabs voice browser.
export function AvatarVoiceSearchDialog({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (voice: PickerVoice) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className="h-auto min-h-11 flex-1 justify-start gap-2 py-2 font-normal text-muted-foreground"
          />
        }
      >
        <Search className="size-4" strokeWidth={1.5} />
        Search voice
      </DialogTrigger>
      <DialogContent className="grid h-[min(40rem,calc(100vh-4rem))] w-[min(64rem,calc(100vw-2rem))] grid-rows-[auto_minmax(0,1fr)] gap-0 p-0 sm:max-w-none">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle>Choose a voice</DialogTitle>
        </DialogHeader>
        <VideoGenChangeVoiceBrowser
          selectedId={selectedId}
          onSelect={(v) => {
            onSelect(v);
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
