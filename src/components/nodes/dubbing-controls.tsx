"use client";

import { Info, Languages, Mic, MessageSquareQuote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DUB_LANGUAGES, DUB_STYLES, dubLanguageLabel, dubStyleLabel, type DubLanguage, type DubStyle, type DubbingOutput } from "@/lib/dubbing/types";
import { dubCredits, lipSyncCredits } from "@/lib/dubbing/cost";
import { DUB_NO_LENGTH_MESSAGE } from "@/lib/dubbing/copy";
import { FieldLabel } from "./field-label";
import { EstimatedCreditsLabel } from "./estimated-credits-label";

type Props = {
  language: DubLanguage;
  onLanguageChange: (l: DubLanguage) => void;
  style: DubStyle;
  onStyleChange: (s: DubStyle) => void;
  /** The connected take's length; 0 when unknown. */
  sourceSeconds: number;
  /** The connected take is still being read, so its length is not known yet. */
  sourceLoading?: boolean;
  /** The active dub's own length, which Lip sync bills; 0 when unknown. */
  activeDubSeconds: number;
  hasSource: boolean;
  activeDub: DubbingOutput | null;
  running: "dub" | "lipsync" | null;
  editable: boolean;
  onDub: () => void;
  onLipSync: () => void;
};

// D374 — the Dubbing view's controls: a language and a translation style, Dub, then Lip sync. No
// voice or model choices: the presenter's own voice and one lip-sync engine (D376).
export function DubbingControls({ language, onLanguageChange, style, onStyleChange, sourceSeconds, sourceLoading = false, activeDubSeconds, hasSource, activeDub, running, editable, onDub, onLipSync }: Props) {
  const busy = running !== null;
  const canDub = editable && hasSource && sourceSeconds > 0 && !busy;
  const canLipSync = editable && Boolean(activeDub) && activeDubSeconds > 0 && !busy;
  const unpriced = hasSource && !sourceLoading && sourceSeconds <= 0;
  return (
    <div className="flex flex-col gap-6 px-6 py-5">
      <div className="flex flex-col gap-2">
        <FieldLabel icon={Languages} label="Dub into" />
        <Select value={language} onValueChange={(v) => { if (v) onLanguageChange(v as DubLanguage); }} disabled={!editable || busy}>
          <SelectTrigger className="w-full"><SelectValue>{dubLanguageLabel(language)}</SelectValue></SelectTrigger>
          <SelectContent>
            {DUB_LANGUAGES.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {!hasSource ? "Connect a video to dub." : unpriced ? DUB_NO_LENGTH_MESSAGE : "The presenter's own voice, speaking the new language."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <FieldLabel icon={MessageSquareQuote} label="Translation style" />
          <Tooltip>
            <TooltipTrigger
              className="inline-flex items-center text-muted-foreground/60 transition-colors hover:text-muted-foreground"
              aria-label="About translation style"
              delay={0}
            >
              <Info className="size-3.5" strokeWidth={1.5} />
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              How the translated lines sound: casual or polished, everyday words or exact terms. Pick the
              tone you want the audience to hear, not the topic. The voice stays the presenter&apos;s own.
            </TooltipContent>
          </Tooltip>
        </div>
        <Select value={style} onValueChange={(v) => { if (v) onStyleChange(v as DubStyle); }} disabled={!editable || busy}>
          <SelectTrigger className="w-full"><SelectValue>{dubStyleLabel(style)}</SelectValue></SelectTrigger>
          <SelectContent>
            {DUB_STYLES.map((s) => (
              <SelectItem key={s.code} value={s.code} className="py-1.5">
                <span className="flex flex-col gap-0.5 whitespace-normal">
                  <span className="font-medium">{s.label}</span>
                  <span className="text-xs text-muted-foreground">{s.hint}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{DUB_STYLES.find((s) => s.code === style)?.hint}</p>
      </div>

      <Button onClick={onDub} disabled={!canDub} className="w-full">
        {running === "dub" ? "Dubbing…" : activeDub ? "Dub again" : "Dub"}
        {running !== "dub" && sourceSeconds > 0 && <EstimatedCreditsLabel credits={dubCredits(sourceSeconds)} />}
      </Button>

      <div className="flex flex-col gap-2">
        <FieldLabel icon={Mic} label="Lip sync" />
        <p className="text-xs text-muted-foreground">
          {activeDub ? "Matches the presenter's mouth to the dubbed voice." : "Make a dub first."}
        </p>
        <Button variant="outline" onClick={onLipSync} disabled={!canLipSync} className="w-full">
          {running === "lipsync" ? "Lip-syncing…" : activeDub?.lipSynced ? "Lip sync again" : "Lip sync"}
          {running !== "lipsync" && activeDub && activeDubSeconds > 0 && <EstimatedCreditsLabel credits={lipSyncCredits(activeDubSeconds)} />}
        </Button>
      </div>
    </div>
  );
}
