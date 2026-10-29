"use client";

import { Info, Languages, MessageSquareQuote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DUB_LANGUAGES, DUB_STYLES, PRESENTER_VOICE, dubLanguageLabel, dubStyleLabel, dubVoiceLabel, type DubLanguage, type DubPace, type DubStyle, type DubVoiceChoice } from "@/lib/dubbing/types";
import { dubCredits } from "@/lib/dubbing/cost";
import { DUB_NO_LENGTH_MESSAGE } from "@/lib/dubbing/copy";
import { FieldLabel } from "./field-label";
import { EstimatedCreditsLabel } from "./estimated-credits-label";
import { DisabledReason } from "./disabled-reason";
import { DubbingAdvanced } from "./dubbing-advanced";
import { dubBlockedReason } from "@/lib/dubbing/blocked-reasons";

type Props = {
  nodeId: string;
  language: DubLanguage;
  onLanguageChange: (l: DubLanguage) => void;
  style: DubStyle;
  onStyleChange: (s: DubStyle) => void;
  voice: DubVoiceChoice;
  onVoiceChange: (v: DubVoiceChoice) => void;
  pace: DubPace;
  onPaceChange: (p: DubPace) => void;
  /** The connected take's length; 0 when unknown. */
  sourceSeconds: number;
  /** The connected take is still being read, so its length is not known yet. */
  sourceLoading: boolean;
  hasSource: boolean;
  hasDub: boolean;
  running: "dub" | "lipsync" | null;
  editable: boolean;
  /** D390 — why the dub can't run (it is in the Editor's reel), or null. */
  locked?: string | null;
  onDub: () => void;
};

// D378 — the Dub tab: a language, a translation style, and Dub (each run is a new version).
export function DubbingDubPanel({ nodeId, language, onLanguageChange, style, onStyleChange, voice, onVoiceChange, pace, onPaceChange, sourceSeconds, sourceLoading, hasSource, hasDub, running, editable, locked = null, onDub }: Props) {
  const busy = running !== null;
  const blocked = dubBlockedReason({ editable, running, hasSource, sourceLoading, sourceSeconds, locked });
  const canDub = editable && hasSource && sourceSeconds > 0 && !busy;
  const unpriced = hasSource && !sourceLoading && sourceSeconds <= 0;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <FieldLabel icon={Languages} label="Dub into" />
        <Select value={language} onValueChange={(v) => { if (v) onLanguageChange(v as DubLanguage); }} disabled={!editable || busy}>
          <SelectTrigger className="w-full"><SelectValue>{dubLanguageLabel(language)}</SelectValue></SelectTrigger>
          <SelectContent>
            {DUB_LANGUAGES.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {!hasSource ? "Connect a video to dub." : unpriced ? DUB_NO_LENGTH_MESSAGE : voice === PRESENTER_VOICE ? "The presenter's own voice, speaking the new language." : `${dubVoiceLabel(voice)}'s voice, speaking the new language.`}
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
              tone you want the audience to hear, not the topic. The voice itself is set under Advanced.
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

      <DubbingAdvanced nodeId={nodeId} language={language} voice={voice} onVoiceChange={onVoiceChange} pace={pace} onPaceChange={onPaceChange} disabled={!editable || busy} />

      <div className="flex flex-col gap-2">
        <DisabledReason reason={canDub ? null : blocked}>
          <Button onClick={onDub} disabled={!canDub} className="w-full">
            {running === "dub" ? "Dubbing…" : hasDub ? "Dub again" : "Dub"}
            {running !== "dub" && sourceSeconds > 0 && <EstimatedCreditsLabel credits={dubCredits(sourceSeconds)} />}
          </Button>
        </DisabledReason>
        <p className="text-xs text-muted-foreground">Each dub is added to History as a new version.</p>
      </div>
    </div>
  );
}
