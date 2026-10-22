"use client";

import { useState } from "react";
import { AudioLines, ChevronDown, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DUB_VOICES, PRESENTER_VOICE, dubLanguageLabel, dubVoiceLabel, isDubVoice, type DubLanguage, type DubVoiceChoice } from "@/lib/dubbing/types";
import { previewLanguage } from "@/lib/dubbing/voice-preview";
import { dubPreviewId, useDubVoicePreview } from "@/hooks/queries/dub-voice-previews";
import { DubbingVoiceRow } from "./dubbing-voice-row";

type Filter = "all" | "female" | "male";

const PRESENTER_META = "Cloned from the take. Keeps the presenter recognisable.";
const genderLabel = (g: string) => (g === "female" ? "Female" : "Male");

// D379 — the Dubbing voice field, like Change voice's: the chosen voice with its gender and a play
// button; clicking it opens a dialog of every voice (All / Female / Male), each with a preview in
// the language being dubbed into, and "Use". The presenter's own voice comes first.
export function DubbingVoicePicker({ nodeId, voice, onVoiceChange, language, disabled }: {
  nodeId: string;
  voice: DubVoiceChoice;
  onVoiceChange: (v: DubVoiceChoice) => void;
  language: DubLanguage;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const preview = useDubVoicePreview(nodeId);
  const chosen = isDubVoice(voice) ? DUB_VOICES.find((v) => v.code === voice) : undefined;
  const voices = DUB_VOICES.filter((v) => filter === "all" || v.gender === filter);
  const previewNote = previewLanguage(language) === language
    ? `Previews are in ${dubLanguageLabel(language)}.`
    : "Previews are in English for this language.";
  const use = (v: DubVoiceChoice) => {
    onVoiceChange(v);
    setOpen(false);
  };
  const isPlaying = (code: string) => isDubVoice(code) && preview.playingId === dubPreviewId(code, language);
  const isLoading = (code: string) => isDubVoice(code) && preview.loadingId === dubPreviewId(code, language);

  return (
    <div className="flex items-center gap-2">
      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) preview.stop(); }}>
        <DialogTrigger
          disabled={disabled}
          render={<Button type="button" variant="outline" className="nodrag h-auto min-h-10 flex-1 justify-between gap-2 py-2 text-left" aria-label={`Voice: ${dubVoiceLabel(voice)}`} />}
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{dubVoiceLabel(voice)}</span>
            <span className="truncate text-xs text-muted-foreground">{chosen ? `${genderLabel(chosen.gender)} · Preset voice` : "Cloned from the take"}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        </DialogTrigger>
        <DialogContent className="grid h-[min(36rem,calc(100vh-4rem))] w-[min(36rem,calc(100vw-2rem))] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-none">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle>Choose a voice</DialogTitle>
          </DialogHeader>
          <div className="px-4 pt-3">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="female">Female</TabsTrigger>
                <TabsTrigger value="male">Male</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="min-h-0 overflow-y-auto px-2 py-2">
            {filter === "all" && (
              <DubbingVoiceRow
                name={dubVoiceLabel(PRESENTER_VOICE)}
                meta={PRESENTER_META}
                selected={voice === PRESENTER_VOICE}
                canPreview={false}
                playing={false}
                loading={false}
                onPreview={() => {}}
                onSelect={() => use(PRESENTER_VOICE)}
              />
            )}
            {voices.map((v) => (
              <DubbingVoiceRow
                key={v.code}
                name={v.label}
                meta={genderLabel(v.gender)}
                selected={voice === v.code}
                canPreview
                playing={isPlaying(v.code)}
                loading={isLoading(v.code)}
                onPreview={() => void preview.play(v.code, language)}
                onSelect={() => use(v.code)}
              />
            ))}
          </div>
          <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            {previewNote} A preset voice replaces the presenter&apos;s own voice and suits one speaker.
          </p>
        </DialogContent>
      </Dialog>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="nodrag shrink-0"
        aria-label={chosen ? `${isPlaying(chosen.code) ? "Stop" : "Play"} preview of ${chosen.label}` : "No preview for the presenter's own voice"}
        disabled={!chosen || disabled || isLoading(chosen.code)}
        onClick={() => chosen && void preview.play(chosen.code, language)}
      >
        {chosen && isLoading(chosen.code) ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
        ) : chosen && isPlaying(chosen.code) ? (
          <AudioLines className="size-4 text-primary motion-safe:animate-pulse" strokeWidth={1.5} />
        ) : (
          <Play className="size-4" strokeWidth={1.5} />
        )}
      </Button>
    </div>
  );
}
