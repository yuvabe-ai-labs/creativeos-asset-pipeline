"use client";

import { Languages, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DUB_LANGUAGES, dubLanguageLabel, type DubLanguage, type DubbingOutput } from "@/lib/dubbing/types";
import { dubCredits, lipSyncCredits } from "@/lib/dubbing/cost";
import { DUB_NO_LENGTH_MESSAGE } from "@/lib/dubbing/copy";
import { FieldLabel } from "./field-label";
import { EstimatedCreditsLabel } from "./estimated-credits-label";

type Props = {
  language: DubLanguage;
  onLanguageChange: (l: DubLanguage) => void;
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

// D374 — the Dubbing view's only controls: a language, Dub, then Lip sync. No voice, settings or
// model choices: the presenter's own voice and one lip-sync engine (D376).
export function DubbingControls({ language, onLanguageChange, sourceSeconds, sourceLoading = false, activeDubSeconds, hasSource, activeDub, running, editable, onDub, onLipSync }: Props) {
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
