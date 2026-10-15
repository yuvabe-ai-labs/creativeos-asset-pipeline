"use client";

import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dubLanguageLabel, type DubbingOutput } from "@/lib/dubbing/types";
import { lipSyncCredits } from "@/lib/dubbing/cost";
import { FieldLabel } from "./field-label";
import { EstimatedCreditsLabel } from "./estimated-credits-label";

type Props = {
  activeDub: DubbingOutput | null;
  /** The active dub's own length, which Lip sync bills; 0 when unknown. */
  activeDubSeconds: number;
  running: "dub" | "lipsync" | null;
  editable: boolean;
  onLipSync: () => void;
  onGoToDub: () => void;
};

// D378 — the Lip sync tab: runs on the dub being viewed. Before any dub it points back to Dub.
export function DubbingLipSyncPanel({ activeDub, activeDubSeconds, running, editable, onLipSync, onGoToDub }: Props) {
  if (!activeDub) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-5">
        <FieldLabel icon={Mic} label="Make a dub first" />
        <p className="text-xs text-muted-foreground">Lip sync matches the presenter&apos;s mouth to a dubbed voice.</p>
        {/* Navigation, not an "Add" action: a plain link, never the dashed + chip. */}
        <Button variant="link" size="sm" onClick={onGoToDub} className="h-auto px-0">
          Go to the Dub tab
        </Button>
      </div>
    );
  }
  const busy = running !== null;
  const canLipSync = editable && activeDubSeconds > 0 && !busy;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <FieldLabel icon={Mic} label={`Match the mouth to the ${dubLanguageLabel(activeDub.language)} dub`} />
        <p className="text-xs text-muted-foreground">
          Redraws the presenter&apos;s mouth so it moves with the new voice. Runs on the dub you&apos;re viewing.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Button onClick={onLipSync} disabled={!canLipSync} className="w-full">
          {running === "lipsync" ? "Lip-syncing…" : activeDub.lipSynced ? "Lip sync again" : "Lip sync"}
          {running !== "lipsync" && activeDubSeconds > 0 && <EstimatedCreditsLabel credits={lipSyncCredits(activeDubSeconds)} />}
        </Button>
        {activeDub.lipSynced && <p className="text-xs text-muted-foreground">Running it again replaces this dub&apos;s lip-synced video.</p>}
      </div>
    </div>
  );
}
