"use client";

import { Loader2, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dubLanguageLabel, type DubbingOutput } from "@/lib/dubbing/types";
import { useCreditSettings, useModelPrice } from "@/hooks/queries/ai-models";
import { lipSyncUsd } from "@/lib/ai-models/service-price";
import { LIP_SYNC_MODEL_ID, priceUnavailableReason } from "@/lib/ai-models/service-models";
import { creditsFromUsd } from "@/lib/credits/units";
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
  locked?: string | null;
  onLipSync: () => void;
};

// D378 — the Lip sync tab: runs on the dub being viewed. A disabled button says why on hover.
export function DubbingLipSyncPanel({ activeDub, activeDubSeconds, running, editable, locked = null, onLipSync }: Props) {
  const blocked = lipSyncBlockedReason({ editable, running, hasDub: true, dubSeconds: activeDubSeconds, locked });
  // D535 - the estimate comes from the price row; the paid button waits until it is known.
  const { price, loading: priceLoading, error: priceError } = useModelPrice(LIP_SYNC_MODEL_ID);
  const usdEstimate = price && activeDubSeconds > 0 ? lipSyncUsd(price, activeDubSeconds) : null;
  const settings = useCreditSettings();
  const credits = usdEstimate !== null && settings ? creditsFromUsd(usdEstimate, settings) : null;
  const waiting = priceLoading || usdEstimate === null;
  const priceReason = activeDubSeconds > 0 ? priceUnavailableReason({ loading: priceLoading, error: priceError }, usdEstimate !== null) : null;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <FieldLabel icon={Mic} label={`Match the mouth to the ${dubLanguageLabel(activeDub.language)} dub`} />
        <p className="text-xs text-muted-foreground">
          Redraws the presenter&apos;s mouth so it moves with the new voice. Runs on the dub you&apos;re viewing.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <DisabledReason reason={blocked ?? priceReason}>
          <Button onClick={onLipSync} disabled={Boolean(blocked) || waiting} className="w-full">
            {priceLoading && activeDubSeconds > 0 && running !== "lipsync" && <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />}
            {running === "lipsync" ? "Lip-syncing…" : activeDub.lipSynced ? "Lip sync again" : "Lip sync"}
            {running !== "lipsync" && !priceLoading && credits !== null && <EstimatedCreditsLabel credits={credits} />}
          </Button>
        </DisabledReason>
        {activeDub.lipSynced && <p className="text-xs text-muted-foreground">Running it again replaces this dub&apos;s lip-synced video.</p>}
      </div>
    </div>
  );
}
