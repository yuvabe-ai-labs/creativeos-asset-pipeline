"use client";

import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dubLanguageLabel, type DubbingOutput } from "@/lib/dubbing/types";
import { lipSyncCredits } from "@/lib/dubbing/cost";
import { lipSyncBlockedReason } from "@/lib/dubbing/blocked-reasons";
import { FieldLabel } from "./field-label";
import { EstimatedCreditsLabel } from "./estimated-credits-label";
import { DisabledReason } from "./disabled-reason";

type Props = {
  /** The dub being viewed. The tab is disabled until there is one. */
  activeDub: DubbingOutput;
  /** The active dub's own length, which Lip sync bills; 0 when unknown. */
  activeDubSeconds: number;
  running: "dub" | "lipsync" | null;
  editable: boolean;
  onLipSync: () => void;
};

// D378 — the Lip sync tab: runs on the dub being viewed. A disabled button says why on hover.
export function DubbingLipSyncPanel({ activeDub, activeDubSeconds, running, editable, onLipSync }: Props) {
  const blocked = lipSyncBlockedReason({ editable, running, hasDub: true, dubSeconds: activeDubSeconds });
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <FieldLabel icon={Mic} label={`Match the mouth to the ${dubLanguageLabel(activeDub.language)} dub`} />
        <p className="text-xs text-muted-foreground">
          Redraws the presenter&apos;s mouth so it moves with the new voice. Runs on the dub you&apos;re viewing.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <DisabledReason reason={blocked}>
          <Button onClick={onLipSync} disabled={Boolean(blocked)} className="w-full">
            {running === "lipsync" ? "Lip-syncing…" : activeDub.lipSynced ? "Lip sync again" : "Lip sync"}
            {running !== "lipsync" && activeDubSeconds > 0 && <EstimatedCreditsLabel credits={lipSyncCredits(activeDubSeconds)} />}
          </Button>
        </DisabledReason>
        {activeDub.lipSynced && <p className="text-xs text-muted-foreground">Running it again replaces this dub&apos;s lip-synced video.</p>}
      </div>
    </div>
  );
}
