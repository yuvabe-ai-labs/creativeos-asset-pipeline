"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Pause, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useVoicePreview as useVoiceSample } from "@/hooks/use-voice-preview";
import { avatarVoiceLine } from "@/lib/avatars/canvas";
import { avatarWorksWith } from "@/lib/avatars/generation";
import { avatarVoiceToPickerVoice } from "@/lib/avatars/voice";
import type { Avatar, AvatarImage } from "@/lib/avatars/schema";
import { FullScreenImageZoom } from "@/components/shared/full-screen-image-zoom";
import { AvatarVoiceSample } from "@/components/avatars/avatar-voice-sample";
import { AvatarFocusPreview } from "./avatar-focus-preview";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avatar: Avatar;
  studioHref: string;
};

function Reference({ label, image, aspect, onZoom }: {
  label: string; image: AvatarImage; aspect: string; onZoom: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-eyebrow text-muted-foreground">{label}</p>
      <Button
        variant="ghost"
        aria-label={`View the ${label.toLowerCase()} full size`}
        onClick={onZoom}
        className="h-auto w-full cursor-zoom-in overflow-hidden rounded-lg border p-0"
        style={{ aspectRatio: aspect }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.url} alt="" className="size-full object-cover" />
      </Button>
    </div>
  );
}

// D298 — the Avatar node's focus view: read-only. The preview clip and the references, so the
// operator can see who presents a script without leaving the canvas. Editing stays in the
// Studio, where consent, credits and the voice rules already live.
export function AvatarFocusView({ open, onOpenChange, avatar, studioHref }: Props) {
  const [zoomed, setZoomed] = useState<{ url: string; title: string } | null>(null);
  const sample = useVoiceSample();
  const named = avatarVoiceToPickerVoice(avatar.voice);
  const models = avatarWorksWith(avatar);

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) sample.stop(); onOpenChange(next); }}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 overflow-y-auto rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-10 pt-3">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="h-auto self-start p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
          >
            <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to canvas
          </Button>

          <header className="flex flex-wrap items-center gap-3">
            <SheetTitle className="p-0 font-display text-3xl font-semibold tracking-tight">{avatar.name}</SheetTitle>
            <Badge variant="outline" className={avatar.archivedAt ? "" : "border-success/40 bg-success/10 text-success-text"}>
              {avatar.archivedAt ? "Archived — still works here" : "In the library"}
            </Badge>
            <Button
              variant="outline"
              className="ml-auto"
              nativeButton={false}
              render={<Link href={studioHref} target="_blank" rel="noopener" />}
            >
              Edit in Studio
              <ArrowUpRight className="size-4" strokeWidth={1.5} />
            </Button>
          </header>

          <div className="grid gap-8 md:grid-cols-[16rem_minmax(0,1fr)]">
            <section aria-label="Preview" className="flex flex-col gap-2">
              <p className="text-eyebrow text-muted-foreground">Preview</p>
              <AvatarFocusPreview avatar={avatar} studioHref={studioHref} />
            </section>

            <section aria-label="References" className="flex flex-col gap-6">
              <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
                {avatar.front && (
                  <Reference label="Front image" image={avatar.front} aspect="3 / 4"
                    onZoom={() => setZoomed({ url: avatar.front!.url, title: "Front image" })} />
                )}
                {avatar.sheet && (
                  <Reference label="Profile sheet" image={avatar.sheet} aspect="16 / 9"
                    onZoom={() => setZoomed({ url: avatar.sheet!.url, title: "Profile sheet" })} />
                )}
              </div>

              <div className="flex max-w-md flex-col gap-2">
                <p className="text-eyebrow text-muted-foreground">Voice</p>
                <div className="flex items-center gap-3">
                  {named && (
                    <Button variant="outline" size="icon-sm" aria-label={`Play ${named.name}'s sample`}
                      onClick={() => sample.toggle(named)}>
                      {sample.playingId === named.voiceId
                        ? <Pause className="size-3.5" strokeWidth={1.5} />
                        : <Play className="size-3.5" strokeWidth={1.5} />}
                    </Button>
                  )}
                  <span className="text-sm font-medium">{avatarVoiceLine(avatar.voice)}</span>
                </div>
                {avatar.voice?.mode === "native" && <AvatarVoiceSample sample={avatar.voiceSample} />}
              </div>

              {avatar.story.trim() && (
                <div className="flex max-w-prose flex-col gap-1.5">
                  <p className="text-eyebrow text-muted-foreground">Background story</p>
                  <p className="text-sm">{avatar.story}</p>
                </div>
              )}

              {models.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-eyebrow text-muted-foreground">Works with</p>
                  <div className="flex flex-wrap gap-1.5">
                    {models.map((m) => <Badge key={m} variant="outline">{m}</Badge>)}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
        {zoomed && <FullScreenImageZoom imageUrl={zoomed.url} title={zoomed.title} onClose={() => setZoomed(null)} />}
      </SheetContent>
    </Sheet>
  );
}
